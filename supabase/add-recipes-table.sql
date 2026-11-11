-- The Dark Sparrow Eats: saved recipes (from "Add a recipe" on the site)
-- Run this ONCE in Supabase: open the dark-sparrow-eats project, go to
-- SQL Editor, paste this whole file, change CHANGE-THIS-CODE (near the
-- bottom) to your own owner code, and click Run.
--
-- What it sets up:
--   public.recipes         recipes added from the site. Anyone can read them;
--                          nobody can write to it directly.
--   public.add_recipe()    the only way to add one. It checks the owner code.
--   private.owner_code     a bcrypt hash of your owner code (never the code itself).
-- It is safe to run again; it won't delete recipes that are already saved.

create table if not exists public.recipes (
  id            text primary key
                check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(id) <= 80),
  title         text not null check (length(title) between 1 and 200),
  category      text check (length(category) <= 60),
  tags          text[] not null default '{}' check (cardinality(tags) <= 12),
  time_minutes  integer check (time_minutes between 1 and 10000),
  servings      text check (length(servings) <= 20),
  image         text check (length(image) <= 1000 and image ~* '^https://'),
  ingredients   text[] not null default '{}'
                check (cardinality(ingredients) <= 150 and length(array_to_string(ingredients, '')) <= 20000),
  steps         text[] not null default '{}'
                check (cardinality(steps) <= 100 and length(array_to_string(steps, '')) <= 40000),
  notes         text check (length(notes) <= 4000),
  source_url    text check (length(source_url) <= 1000 and source_url ~* '^https?://'),
  created_at    timestamptz not null default now(),
  hidden        boolean not null default false
);

alter table public.recipes enable row level security;

drop policy if exists "Visitors can read visible recipes" on public.recipes;
create policy "Visitors can read visible recipes"
  on public.recipes for select
  to anon, authenticated
  using (hidden = false);

revoke all on public.recipes from anon, authenticated;
grant select on public.recipes to anon, authenticated;

create table if not exists private.owner_code (
  id          integer primary key default 1 check (id = 1),
  code_hash   text not null,
  updated_at  timestamptz not null default now()
);

create table if not exists private.owner_code_failures (
  at timestamptz not null default now()
);

create or replace function public.add_recipe(p_code text, p_recipe jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash   text;
  v_base   text;
  v_id     text;
  v_n      integer := 1;
  v_title  text;
  v_time   integer;
begin
  -- Pause after 10 wrong codes in 10 minutes, so nobody can guess it.
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

  if p_recipe is null or jsonb_typeof(p_recipe) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  v_title := btrim(coalesce(p_recipe->>'title', ''));
  if v_title = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_title');
  end if;

  -- Make a link-friendly id from the requested id (or the title), unique in the table.
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

revoke all on function public.add_recipe(text, jsonb) from public;
grant execute on function public.add_recipe(text, jsonb) to anon, authenticated;

-- Your owner code. Change CHANGE-THIS-CODE before running.
-- To change it later, run just these lines again with the new code.
insert into private.owner_code (id, code_hash)
values (1, extensions.crypt('CHANGE-THIS-CODE', extensions.gen_salt('bf')))
on conflict (id) do update
  set code_hash = excluded.code_hash, updated_at = now();
