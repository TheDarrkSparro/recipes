-- The Dark Sparrow Eats: who contributed each recipe
-- Run this ONCE in Supabase, after add-recipe-hiding.sql (it uses the site
-- owner set there): open the dark-sparrow-eats project, go to SQL Editor,
-- paste this whole file, and click Run. It is safe to run again.
--
-- What it sets up:
--   public.recipe_contributors        one row per recipe:
--       contributor  the "Contributed by" name shown on the recipe page
--                    (for example "Grandma Garro"). Only the owner sets it.
--       added_by     the site account that added the recipe, saved
--                    automatically. Only the owner can see it.
--   public.owner_set_contributor(id, name)   set or clear the name (owner only).
--   public.owner_contributor_details()        names plus who added each recipe
--                                             (owner only).
--
-- Works for recipes added on the site and for ones written in recipes.js.
-- Recipes that already exist have no "added by" (it wasn't recorded before).
-- For a recipe from recipes.js, "added by" is the account that first edited it
-- on the site.

create table if not exists public.recipe_contributors (
  id           text primary key
               check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(id) <= 80),
  contributor  text check (contributor is null or length(btrim(contributor)) between 1 and 80),
  added_by     uuid references auth.users (id) on delete set null,
  added_at     timestamptz
);

alter table public.recipe_contributors enable row level security;

-- Visitors can read the names, but not for hidden recipes, and never added_by.
drop policy if exists "Anyone can read contributor names" on public.recipe_contributors;
create policy "Anyone can read contributor names"
  on public.recipe_contributors for select
  to anon, authenticated
  using (contributor is not null and not public.recipe_is_hidden(id));

revoke all on public.recipe_contributors from anon, authenticated;
grant select (id, contributor) on public.recipe_contributors to anon, authenticated;

-- ---------- Record who added a recipe, automatically ----------
create or replace function private.record_recipe_added_by()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    insert into public.recipe_contributors (id, added_by, added_at)
    values (new.id, auth.uid(), now())
    on conflict (id) do update
      set added_by = coalesce(public.recipe_contributors.added_by, excluded.added_by),
          added_at = coalesce(public.recipe_contributors.added_at, excluded.added_at);
  end if;
  return new;
end;
$$;

drop trigger if exists recipes_record_added_by on public.recipes;
create trigger recipes_record_added_by
  after insert on public.recipes
  for each row execute function private.record_recipe_added_by();

-- ---------- Set the "Contributed by" name (owner only) ----------
create or replace function public.owner_set_contributor(p_id text, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
begin
  if not private.is_contributor() then
    return private.contributor_error();
  end if;
  if not private.is_owner() then
    return jsonb_build_object('ok', false, 'error', 'not_owner');
  end if;
  if p_id is null or p_id !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(p_id) > 80
     or (v_name is not null and length(v_name) > 80) then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;
  if v_name ~* '(https?://|www\.)' then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  insert into public.recipe_contributors (id, contributor)
  values (p_id, v_name)
  on conflict (id) do update set contributor = excluded.contributor;

  return jsonb_build_object('ok', true, 'id', p_id, 'contributor', v_name);
end;
$$;

-- ---------- Names and who added each recipe (owner only) ----------
create or replace function public.owner_contributor_details()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_owner() then
    return jsonb_build_object('ok', false, 'error', 'not_owner');
  end if;
  return jsonb_build_object(
    'ok', true,
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'contributor', c.contributor,
        'added_by', u.email,
        'added_at', c.added_at))
      from public.recipe_contributors c
      left join auth.users u on u.id = c.added_by
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.owner_set_contributor(text, text) from public, anon;
revoke all on function public.owner_contributor_details() from public, anon;
grant execute on function public.owner_set_contributor(text, text) to authenticated;
grant execute on function public.owner_contributor_details() to authenticated;
