-- The Dark Sparrow Eats: cook profiles
-- Run this ONCE in Supabase, after add-recipe-hiding.sql and
-- add-contributors.sql: open the dark-sparrow-eats project, go to SQL Editor,
-- paste this whole file, and click Run. It is safe to run again.
--
-- A profile belongs to a cook's name: the same name used for "Contributed by"
-- on recipes. It works for cooks with or without a site account.
--
--   Public (anyone):            name, photo, about, specialty, hometown, relation
--   Family only (signed in):    birthday (month and day), phone, email
--
-- Who can change a profile:
--   * The site owner can create, change, link and delete any profile.
--   * A contributor can change their own profile (the one linked to their
--     account), or create one if they don't have one yet.
--
-- Linking a profile to an account happens by email: when the profile's email
-- matches the email of a site account, the profile is linked to that account
-- the next time that person opens "My profile" (for example right after
-- accepting their invite), or straight away when the owner saves it.

create table if not exists public.cook_profiles (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (length(btrim(name)) between 1 and 80),
  photo           text check (photo is null or length(photo) <= 400000),
  bio             text check (bio is null or length(bio) <= 1500),
  specialty       text check (specialty is null or length(specialty) <= 120),
  hometown        text check (hometown is null or length(hometown) <= 80),
  relation        text check (relation is null or length(relation) <= 80),
  birthday_month  smallint check (birthday_month between 1 and 12),
  birthday_day    smallint check (birthday_day between 1 and 31),
  phone           text check (phone is null or length(phone) <= 30),
  email           text check (email is null or length(email) <= 120),
  user_id         uuid unique references auth.users (id) on delete set null,
  updated_at      timestamptz not null default now()
);

create unique index if not exists cook_profiles_name_key on public.cook_profiles (lower(name));

alter table public.cook_profiles enable row level security;

-- Everyone can read the public columns only; family-only columns come through
-- family_profile_details() below.
drop policy if exists "Anyone can read public profile fields" on public.cook_profiles;
create policy "Anyone can read public profile fields"
  on public.cook_profiles for select
  to anon, authenticated
  using (true);

revoke all on public.cook_profiles from anon, authenticated;
grant select (id, name, photo, bio, specialty, hometown, relation, updated_at)
  on public.cook_profiles to anon, authenticated;

-- ---------- Checking what someone typed ----------
-- Returns an error key, or null when the profile data is fine.
create or replace function private.profile_problem(p jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_name  text := btrim(coalesce(p->>'name', ''));
  v_photo text := nullif(btrim(coalesce(p->>'photo', '')), '');
  v_email text := nullif(btrim(coalesce(p->>'email', '')), '');
  v_phone text := nullif(btrim(coalesce(p->>'phone', '')), '');
  v_m     text := nullif(p->>'birthday_month', '');
  v_d     text := nullif(p->>'birthday_day', '');
begin
  if p is null or jsonb_typeof(p) <> 'object' then return 'invalid_input'; end if;
  if v_name = '' or length(v_name) > 80 then return 'invalid_name'; end if;
  if lower(v_name) in ('hidden', 'other') then return 'invalid_name'; end if;
  if v_photo is not null and not (
       v_photo ~ '^https://[^\s"<>]+$'
       or v_photo ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$') then
    return 'invalid_photo';
  end if;
  if v_photo is not null and length(v_photo) > 400000 then return 'photo_too_big'; end if;
  if length(coalesce(p->>'bio', '')) > 1500 or length(coalesce(p->>'specialty', '')) > 120
     or length(coalesce(p->>'hometown', '')) > 80 or length(coalesce(p->>'relation', '')) > 80 then
    return 'too_long';
  end if;
  if v_email is not null and (length(v_email) > 120 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    return 'invalid_email';
  end if;
  if v_phone is not null and (length(v_phone) > 30 or v_phone !~ '^[0-9 +().\-]+$') then
    return 'invalid_phone';
  end if;
  if (v_m is null) <> (v_d is null) then return 'invalid_birthday'; end if;
  if v_m is not null then
    if v_m !~ '^\d{1,2}$' or v_d !~ '^\d{1,2}$' then return 'invalid_birthday'; end if;
    if v_m::int not between 1 and 12 or v_d::int < 1
       or v_d::int > (array[31,29,31,30,31,30,31,31,30,31,30,31])[v_m::int] then
      return 'invalid_birthday';
    end if;
  end if;
  return null;
end;
$$;

-- Write the typed fields into a profile row (shared by owner and self saves).
create or replace function private.apply_profile(p_id uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.cook_profiles set
    name           = btrim(p->>'name'),
    photo          = nullif(btrim(coalesce(p->>'photo', '')), ''),
    bio            = nullif(btrim(coalesce(p->>'bio', '')), ''),
    specialty      = nullif(btrim(coalesce(p->>'specialty', '')), ''),
    hometown       = nullif(btrim(coalesce(p->>'hometown', '')), ''),
    relation       = nullif(btrim(coalesce(p->>'relation', '')), ''),
    birthday_month = nullif(p->>'birthday_month', '')::smallint,
    birthday_day   = nullif(p->>'birthday_day', '')::smallint,
    phone          = nullif(btrim(coalesce(p->>'phone', '')), ''),
    email          = nullif(lower(btrim(coalesce(p->>'email', ''))), ''),
    updated_at     = now()
  where id = p_id;
end;
$$;

-- When a profile's name changes, recipes credited to the old name follow it.
create or replace function private.rename_cook(p_old text, p_new text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.recipe_contributors set contributor = p_new
  where p_old is not null and p_old <> p_new and contributor = p_old;
$$;

-- Link a profile to the account with the same email, if that account has no
-- profile yet. Returns true when a link was made.
create or replace function private.link_profile_by_email(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
begin
  select u.id into v_uid
  from public.cook_profiles c
  join auth.users u on lower(u.email) = c.email
  where c.id = p_id and c.user_id is null and c.email is not null
    and not exists (select 1 from public.cook_profiles o where o.user_id = u.id)
  limit 1;
  if v_uid is null then return false; end if;
  update public.cook_profiles set user_id = v_uid where id = p_id;
  return true;
end;
$$;

-- ---------- For the signed-in person: their own profile ----------
create or replace function public.my_profile()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_id    uuid;
begin
  if not private.is_contributor() then
    return private.contributor_error();
  end if;
  v_email := (select lower(email) from auth.users where id = auth.uid());

  v_id := (select id from public.cook_profiles where user_id = auth.uid());
  if v_id is null then
    -- A profile the owner made with this person's email: link it now.
    v_id := (select id from public.cook_profiles
             where user_id is null and email = v_email
             order by updated_at limit 1);
    if v_id is not null then
      update public.cook_profiles set user_id = auth.uid() where id = v_id;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'account_email', v_email,
    'profile', (select to_jsonb(c) - 'user_id' from public.cook_profiles c where c.id = v_id)
  );
end;
$$;

create or replace function public.save_my_profile(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_problem text;
  v_id      uuid;
  v_old     text;
  v_name    text := btrim(coalesce(p->>'name', ''));
begin
  if not private.is_contributor() then
    return private.contributor_error();
  end if;
  v_problem := private.profile_problem(p);
  if v_problem is not null then
    return jsonb_build_object('ok', false, 'error', v_problem);
  end if;

  select id, name into v_id, v_old from public.cook_profiles where user_id = auth.uid();

  if exists (select 1 from public.cook_profiles
             where lower(name) = lower(v_name) and id is distinct from v_id) then
    return jsonb_build_object('ok', false, 'error', 'name_taken');
  end if;
  -- A new name can't take over credits that belong to another cook.
  if (v_old is null or lower(v_old) <> lower(v_name))
     and exists (select 1 from public.recipe_contributors where lower(contributor) = lower(v_name)) then
    return jsonb_build_object('ok', false, 'error', 'name_is_credited');
  end if;

  if v_id is null then
    insert into public.cook_profiles (name, user_id) values (v_name, auth.uid())
    returning id into v_id;
  end if;
  perform private.apply_profile(v_id, p);
  perform private.rename_cook(v_old, v_name);

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- ---------- Family-only details, for signed-in contributors ----------
create or replace function public.family_profile_details()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_owner boolean := private.is_owner();
begin
  if not private.is_contributor() then
    return private.contributor_error();
  end if;
  return jsonb_build_object(
    'ok', true,
    'rows', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'birthday_month', c.birthday_month,
          'birthday_day', c.birthday_day,
          'phone', c.phone,
          'email', c.email,
          'is_me', c.user_id = auth.uid()
        ) || case when v_owner then jsonb_build_object(
          'linked_account', (select u.email from auth.users u where u.id = c.user_id)
        ) else '{}'::jsonb end)
      from public.cook_profiles c
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------- The owner: create, change, unlink and delete any profile ----------
-- p_id null = new profile. p may include "unlink": true to detach the account.
create or replace function public.owner_save_profile(p_id uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_problem text;
  v_id      uuid := p_id;
  v_old     text;
  v_name    text := btrim(coalesce(p->>'name', ''));
  v_linked  boolean := false;
begin
  if not private.is_contributor() then
    return private.contributor_error();
  end if;
  if not private.is_owner() then
    return jsonb_build_object('ok', false, 'error', 'not_owner');
  end if;
  v_problem := private.profile_problem(p);
  if v_problem is not null then
    return jsonb_build_object('ok', false, 'error', v_problem);
  end if;
  if exists (select 1 from public.cook_profiles
             where lower(name) = lower(v_name) and id is distinct from v_id) then
    return jsonb_build_object('ok', false, 'error', 'name_taken');
  end if;

  if v_id is null then
    insert into public.cook_profiles (name) values (v_name) returning id into v_id;
  else
    select name into v_old from public.cook_profiles where id = v_id;
    if v_old is null then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
  end if;

  perform private.apply_profile(v_id, p);
  perform private.rename_cook(v_old, v_name);
  if coalesce((p->>'unlink')::boolean, false) then
    update public.cook_profiles set user_id = null where id = v_id;
  else
    v_linked := private.link_profile_by_email(v_id);
  end if;

  return jsonb_build_object('ok', true, 'id', v_id, 'linked_now', v_linked);
end;
$$;

create or replace function public.owner_delete_profile(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_contributor() then
    return private.contributor_error();
  end if;
  if not private.is_owner() then
    return jsonb_build_object('ok', false, 'error', 'not_owner');
  end if;
  delete from public.cook_profiles where id = p_id;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function private.profile_problem(jsonb) from public;
revoke all on function private.apply_profile(uuid, jsonb) from public;
revoke all on function private.rename_cook(text, text) from public;
revoke all on function private.link_profile_by_email(uuid) from public;
revoke all on function public.my_profile() from public, anon;
revoke all on function public.save_my_profile(jsonb) from public, anon;
revoke all on function public.family_profile_details() from public, anon;
revoke all on function public.owner_save_profile(uuid, jsonb) from public, anon;
revoke all on function public.owner_delete_profile(uuid) from public, anon;
grant execute on function public.my_profile() to authenticated;
grant execute on function public.save_my_profile(jsonb) to authenticated;
grant execute on function public.family_profile_details() to authenticated;
grant execute on function public.owner_save_profile(uuid, jsonb) to authenticated;
grant execute on function public.owner_delete_profile(uuid) to authenticated;
