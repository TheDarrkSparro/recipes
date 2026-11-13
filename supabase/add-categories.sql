-- The Dark Sparrow Eats: the site's fixed list of recipe categories
-- Run this ONCE in Supabase, after add-recipe-hiding.sql (it uses the site
-- owner set there): open the dark-sparrow-eats project, go to SQL Editor,
-- paste this whole file, and click Run. It is safe to run again; it never
-- overwrites a list you've already edited.
--
-- What it sets up:
--   public.recipe_categories        the categories offered in the Category
--                                   drop-down, in order. Anyone can read them;
--                                   only the site owner can change them.
--   public.owner_save_categories()  saves the whole list from the site's
--                                   "Edit categories" page (owner only).
--                                   Renaming a category also moves every recipe
--                                   saved on the site to the new name, and
--                                   remembers the old name so recipes written in
--                                   recipes.js follow along too.
--   recipes_category_check          a database check: a recipe can only be
--                                   saved with a category from the list, so the
--                                   list can't be got around from the browser.

create table if not exists public.recipe_categories (
  name          text primary key check (length(btrim(name)) between 1 and 60),
  sort_order    integer not null default 0,
  also_matches  text[] not null default '{}'
);

alter table public.recipe_categories enable row level security;

drop policy if exists "Anyone can read categories" on public.recipe_categories;
create policy "Anyone can read categories"
  on public.recipe_categories for select
  to anon, authenticated
  using (true);

revoke all on public.recipe_categories from anon, authenticated;
grant select on public.recipe_categories to anon, authenticated;

-- Starting list: the categories the site uses today. Only added when the
-- list is empty, so running this file again never undoes your edits.
insert into public.recipe_categories (name, sort_order)
select v.name, v.sort_order
from (values
  ('Breakfast', 1),
  ('Bread', 2),
  ('Mains', 3),
  ('Sides', 4),
  ('Soups & Stews', 5),
  ('Pickles', 6),
  ('Spice Blends', 7)
) as v(name, sort_order)
where not exists (select 1 from public.recipe_categories);

-- ---------- Save the whole list (owner only) ----------
-- p_list is the new list in order: [{"name": "Soups", "was": "Soups & Stews"}, ...]
-- "was" is the category's name before this save (missing for a new one).
-- Categories left out of the list are removed.
create or replace function public.owner_save_categories(p_list jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item   jsonb;
  v_name   text;
  v_was    text;
  v_seen   text[] := '{}';
  v_alias  text[];
  v_rows   jsonb := '[]'::jsonb;
  v_moves  jsonb := '[]'::jsonb;
  v_i      integer := 0;
begin
  if not private.is_contributor() then
    return private.contributor_error();
  end if;
  if not private.is_owner() then
    return jsonb_build_object('ok', false, 'error', 'not_owner');
  end if;

  if p_list is null or jsonb_typeof(p_list) <> 'array'
     or jsonb_array_length(p_list) = 0 or jsonb_array_length(p_list) > 40 then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  -- Check everything first, so a bad entry changes nothing.
  for v_item in select * from jsonb_array_elements(p_list) loop
    v_name := btrim(coalesce(v_item->>'name', ''));
    if v_name = '' or length(v_name) > 60 then
      return jsonb_build_object('ok', false, 'error', 'invalid_name');
    end if;
    if lower(v_name) in ('hidden', 'other') then
      return jsonb_build_object('ok', false, 'error', 'reserved_name', 'name', v_name);
    end if;
    if lower(v_name) = any (v_seen) then
      return jsonb_build_object('ok', false, 'error', 'duplicate_name', 'name', v_name);
    end if;
    v_seen := v_seen || lower(v_name);
  end loop;

  -- Work out each category's remembered old names, and move recipes saved
  -- on the site from an old name to the new one.
  for v_item in select * from jsonb_array_elements(p_list) loop
    v_i := v_i + 1;
    v_name := btrim(v_item->>'name');
    v_was := nullif(btrim(coalesce(v_item->>'was', '')), '');
    v_alias := '{}';
    if v_was is not null then
      v_alias := coalesce((select c.also_matches from public.recipe_categories c where c.name = v_was), '{}');
      if v_was <> v_name then
        v_alias := array(select distinct a from unnest(v_alias || v_was) a where lower(a) <> lower(v_name));
        v_moves := v_moves || jsonb_build_object('old', v_was, 'new', v_name);
      end if;
    end if;
    v_rows := v_rows || jsonb_build_object('name', v_name, 'sort_order', v_i, 'also_matches', to_jsonb(v_alias));
  end loop;

  delete from public.recipe_categories where true;
  insert into public.recipe_categories (name, sort_order, also_matches)
  select r->>'name', (r->>'sort_order')::integer,
         -- An old name that is now another category's real name is dropped.
         array(select a from jsonb_array_elements_text(r->'also_matches') a
               where lower(a) <> all (v_seen))
  from jsonb_array_elements(v_rows) r;

  -- One update for all renames, so swapping two names works. (After the new
  -- list is in place, so the category check below accepts the new names.)
  update public.recipes r
  set category = m->>'new'
  from jsonb_array_elements(v_moves) m
  where r.category = m->>'old';

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.owner_save_categories(jsonb) from public, anon;
grant execute on function public.owner_save_categories(jsonb) to authenticated;

-- ---------- Only categories from the list ----------
-- New recipes, and edits that change a recipe's category, must use a name
-- from the list. An edit that leaves an old category alone is allowed, and
-- nothing is checked while the list is empty.
create or replace function private.check_recipe_category()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.category is not distinct from old.category then
    return new;
  end if;
  -- Saving an edit arrives as an insert of the same id first.
  if tg_op = 'INSERT' and exists (
    select 1 from public.recipes r
    where r.id = new.id and r.category is not distinct from new.category
  ) then
    return new;
  end if;
  if not exists (select 1 from public.recipe_categories) then
    return new;
  end if;
  if new.category is null
     or not exists (select 1 from public.recipe_categories c where c.name = new.category) then
    raise exception 'Category "%" is not in the category list', coalesce(new.category, '(none)')
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists recipes_category_check on public.recipes;
create trigger recipes_category_check
  before insert or update of category on public.recipes
  for each row execute function private.check_recipe_category();
