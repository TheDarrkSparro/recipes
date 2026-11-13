-- The Dark Sparrow Eats: contributor accounts (sign in to add and edit)
-- Run this ONCE in Supabase, after the other files in this folder: open the
-- dark-sparrow-eats project, go to SQL Editor, paste this whole file, and
-- click Run. It is safe to run again. See "Contributor accounts" in README.md
-- for the Supabase settings to change first.
--
-- What it does:
--   * Adds sign-in versions of saving, editing, photo uploads and photo
--     reading. They work only for someone who is signed in with an account
--     that was INVITED from the Supabase dashboard (Authentication > Users >
--     Invite user). An account made any other way can't save anything.
--   * Switches off the owner code. The old owner-code functions stay in the
--     database but nobody can call them. To switch the code back on, run
--     restore-owner-code.sql.
--
-- Reading recipes and leaving reviews are unchanged and need no account.

-- Signed in, invited, and not blocked or deleted.
create or replace function private.is_contributor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.users u
    where u.id = auth.uid()
      and u.invited_at is not null
      and u.deleted_at is null
      and (u.banned_until is null or u.banned_until < now())
  );
$$;

create or replace function private.contributor_error()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null then jsonb_build_object('ok', false, 'error', 'not_signed_in')
    else jsonb_build_object('ok', false, 'error', 'not_contributor')
  end;
$$;

-- ---------- Add a recipe ----------
create or replace function public.contributor_add_recipe(p_recipe jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base   text;
  v_id     text;
  v_n      integer := 1;
  v_title  text;
  v_time   integer;
begin
  if not private.is_contributor() then
    return private.contributor_error();
  end if;

  if p_recipe is null or jsonb_typeof(p_recipe) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  v_title := btrim(coalesce(p_recipe->>'title', ''));
  if v_title = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_title');
  end if;

  -- A link-friendly id from the requested id (or the title), unique in the table.
  v_base := lower(coalesce(nullif(btrim(p_recipe->>'id'), ''), v_title));
  v_base := regexp_replace(v_base, '[^a-z0-9]+', '-', 'g');
  v_base := btrim(v_base, '-');
  v_base := left(v_base, 70);
  v_base := btrim(v_base, '-');
  if v_base = '' then v_base := 'recipe'; end if;
  v_id := v_base;
  while exists (select 1 from public.recipes where id = v_id) loop
    v_n := v_n + 1;
    v_id := v_base || '-' || v_n;
  end loop;

  begin
    v_time := nullif(p_recipe->>'timeMinutes', '')::integer;
  exception when others then
    v_time := null;
  end;

  insert into public.recipes
    (id, title, category, tags, time_minutes, servings, image,
     ingredients, steps, notes, source_url)
  values (
    v_id,
    v_title,
    nullif(btrim(coalesce(p_recipe->>'category', '')), ''),
    case when jsonb_typeof(p_recipe->'tags') = 'array'
      then array(select btrim(t) from jsonb_array_elements_text(p_recipe->'tags') t where btrim(t) <> '')
      else '{}' end,
    v_time,
    nullif(btrim(coalesce(p_recipe->>'servings', '')), ''),
    nullif(btrim(coalesce(p_recipe->>'image', '')), ''),
    case when jsonb_typeof(p_recipe->'ingredients') = 'array'
      then array(select btrim(t) from jsonb_array_elements_text(p_recipe->'ingredients') t where btrim(t) <> '')
      else '{}' end,
    case when jsonb_typeof(p_recipe->'steps') = 'array'
      then array(select btrim(t) from jsonb_array_elements_text(p_recipe->'steps') t where btrim(t) <> '')
      else '{}' end,
    nullif(btrim(coalesce(p_recipe->>'notes', '')), ''),
    nullif(btrim(coalesce(p_recipe->>'source', '')), '')
  );

  return jsonb_build_object('ok', true, 'id', v_id);
exception
  when check_violation or string_data_right_truncation or invalid_text_representation then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
end;
$$;

-- ---------- Edit a recipe ----------
create or replace function public.contributor_update_recipe(p_id text, p_recipe jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title  text;
  v_time   integer;
begin
  if not private.is_contributor() then
    return private.contributor_error();
  end if;

  if p_id is null or p_id !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(p_id) > 80 then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;
  if p_recipe is null or jsonb_typeof(p_recipe) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  v_title := btrim(coalesce(p_recipe->>'title', ''));
  if v_title = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_title');
  end if;

  begin
    v_time := nullif(p_recipe->>'timeMinutes', '')::integer;
  exception when others then
    v_time := null;
  end;

  insert into public.recipes as r
    (id, title, category, tags, time_minutes, servings, image,
     ingredients, steps, notes, source_url)
  values (
    p_id,
    v_title,
    nullif(btrim(coalesce(p_recipe->>'category', '')), ''),
    case when jsonb_typeof(p_recipe->'tags') = 'array'
      then array(select btrim(t) from jsonb_array_elements_text(p_recipe->'tags') t where btrim(t) <> '')
      else '{}' end,
    v_time,
    nullif(btrim(coalesce(p_recipe->>'servings', '')), ''),
    nullif(btrim(coalesce(p_recipe->>'image', '')), ''),
    case when jsonb_typeof(p_recipe->'ingredients') = 'array'
      then array(select btrim(t) from jsonb_array_elements_text(p_recipe->'ingredients') t where btrim(t) <> '')
      else '{}' end,
    case when jsonb_typeof(p_recipe->'steps') = 'array'
      then array(select btrim(t) from jsonb_array_elements_text(p_recipe->'steps') t where btrim(t) <> '')
      else '{}' end,
    nullif(btrim(coalesce(p_recipe->>'notes', '')), ''),
    nullif(btrim(coalesce(p_recipe->>'source', '')), '')
  )
  on conflict (id) do update set
    title        = excluded.title,
    category     = excluded.category,
    tags         = excluded.tags,
    time_minutes = excluded.time_minutes,
    servings     = excluded.servings,
    image        = excluded.image,
    ingredients  = excluded.ingredients,
    steps        = excluded.steps,
    notes        = excluded.notes,
    source_url   = excluded.source_url;

  return jsonb_build_object('ok', true, 'id', p_id);
exception
  when check_violation or string_data_right_truncation or invalid_text_representation then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
end;
$$;

-- ---------- Photo upload ticket (dish photos) ----------
-- Uses the same tickets table and storage rule as add-photo-uploads.sql.
create or replace function public.contributor_photo_upload_ticket()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token  uuid;
begin
  if not private.is_contributor() then
    return private.contributor_error();
  end if;
  v_token := gen_random_uuid();
  delete from private.photo_upload_tickets where expires_at < now();
  insert into private.photo_upload_tickets (token) values (v_token);
  return jsonb_build_object('ok', true, 'ticket', v_token);
end;
$$;

-- ---------- Photo reading (recipe cards) ----------
-- Uses the same daily limit as add-photo-reading.sql (50 a day).
create or replace function public.contributor_photo_read_ticket()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_contributor() then
    return private.contributor_error();
  end if;
  if (select count(*) from private.photo_reads
      where at > now() - interval '1 day') >= 50 then
    return jsonb_build_object('ok', false, 'error', 'daily_limit');
  end if;
  delete from private.photo_reads where at < now() - interval '2 days';
  insert into private.photo_reads default values;
  return jsonb_build_object('ok', true);
end;
$$;

-- Only signed-in people may call these (the checks above do the rest).
revoke all on function public.contributor_add_recipe(jsonb) from public, anon;
revoke all on function public.contributor_update_recipe(text, jsonb) from public, anon;
revoke all on function public.contributor_photo_upload_ticket() from public, anon;
revoke all on function public.contributor_photo_read_ticket() from public, anon;
grant execute on function public.contributor_add_recipe(jsonb) to authenticated;
grant execute on function public.contributor_update_recipe(text, jsonb) to authenticated;
grant execute on function public.contributor_photo_upload_ticket() to authenticated;
grant execute on function public.contributor_photo_read_ticket() to authenticated;

-- ---------- Switch off the owner code ----------
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.add_recipe(text, jsonb)',
    'public.update_recipe(text, text, jsonb)',
    'public.photo_upload_ticket(text)',
    'public.photo_read_ticket(text)'
  ] loop
    if to_regprocedure(f) is not null then
      execute 'revoke execute on function ' || f || ' from public, anon, authenticated';
    end if;
  end loop;
end;
$$;
