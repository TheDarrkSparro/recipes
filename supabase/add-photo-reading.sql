-- The Dark Sparrow Eats: "Read a recipe from a photo" on Add a recipe
-- Run this ONCE in Supabase, after add-recipes-table.sql: open the
-- dark-sparrow-eats project, go to SQL Editor, paste this whole file, and
-- click Run. It is safe to run again.
--
-- What it sets up:
--   public.photo_read_ticket()   the Cloudflare Worker calls this before it
--                                sends a photo to Claude. It checks your owner
--                                code (the same one used to save recipes) and
--                                allows at most 50 photo reads a day, so a
--                                stolen code can't run up your Claude bill.
--   private.photo_reads          one row per photo read, for that daily limit.
--
-- To change the daily limit, change 50 below and run this file again.

create table if not exists private.photo_reads (
  at timestamptz not null default now()
);

create or replace function public.photo_read_ticket(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash  text;
begin
  -- Same lock-out as saving a recipe: 10 wrong codes in 10 minutes pauses it.
  if (select count(*) from private.owner_code_failures
      where at > now() - interval '10 minutes') >= 10 then
    return jsonb_build_object('ok', false, 'error', 'too_many_attempts');
  end if;

  select code_hash into v_hash from private.owner_code where id = 1;
  if v_hash is null or p_code is null or length(p_code) > 100
     or extensions.crypt(p_code, v_hash) <> v_hash then
    insert into private.owner_code_failures default values;
    delete from private.owner_code_failures where at < now() - interval '1 day';
    return jsonb_build_object('ok', false, 'error', 'wrong_code');
  end if;

  -- Daily limit on photo reads (each one costs a little on your Claude account).
  if (select count(*) from private.photo_reads
      where at > now() - interval '1 day') >= 50 then
    return jsonb_build_object('ok', false, 'error', 'daily_limit');
  end if;

  delete from private.photo_reads where at < now() - interval '2 days';
  insert into private.photo_reads default values;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.photo_read_ticket(text) from public;
grant execute on function public.photo_read_ticket(text) to anon, authenticated;
