-- The Dark Sparrow Eats: photo uploads for "Add a recipe"
-- Run this ONCE in Supabase, after add-recipes-table.sql: open the
-- dark-sparrow-eats project, go to SQL Editor, paste this whole file, and
-- click Run. It is safe to run again.
--
-- What it sets up:
--   storage bucket "recipe-photos"   holds uploaded photos. Anyone can view a
--                                    photo by its link; only JPEG, PNG or WebP,
--                                    5 MB at most.
--   public.photo_upload_ticket()     checks your owner code (the same one as
--                                    add_recipe) and hands back a one-time
--                                    folder name that is good for 15 minutes.
--   upload rule on storage.objects   a photo can only be saved inside a folder
--                                    that a valid ticket names. Without your
--                                    owner code, nobody can upload anything.
--
-- To delete a photo later: Storage -> recipe-photos -> pick the file -> Delete.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recipe-photos', 'recipe-photos', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create table if not exists private.photo_upload_tickets (
  token       uuid primary key default gen_random_uuid(),
  expires_at  timestamptz not null default now() + interval '15 minutes'
);

create or replace function public.photo_upload_ticket(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash   text;
  v_token  uuid;
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

  delete from private.photo_upload_tickets where expires_at < now();
  insert into private.photo_upload_tickets default values returning token into v_token;
  return jsonb_build_object('ok', true, 'ticket', v_token);
end;
$$;

revoke all on function public.photo_upload_ticket(text) from public;
grant execute on function public.photo_upload_ticket(text) to anon, authenticated;

-- Used by the upload rule below: is the first folder of this file a live ticket?
create or replace function public.photo_ticket_is_valid(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.photo_upload_tickets t
    where t.token::text = split_part(p_name, '/', 1)
      and t.expires_at > now()
  );
$$;

revoke all on function public.photo_ticket_is_valid(text) from public;
grant execute on function public.photo_ticket_is_valid(text) to anon, authenticated;

drop policy if exists "Upload recipe photos with a ticket" on storage.objects;
create policy "Upload recipe photos with a ticket"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'recipe-photos' and public.photo_ticket_is_valid(name));
