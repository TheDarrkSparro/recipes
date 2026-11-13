-- The Dark Sparrow Eats: hide a recipe from the public site
-- Run this ONCE in Supabase, after add-accounts.sql: open the
-- dark-sparrow-eats project, go to SQL Editor, paste this whole file,
-- change YOUR-EMAIL@example.com (at the very bottom) to the email you sign in
-- to the site with, and click Run. It is safe to run again.
--
-- Only the site owner can hide a recipe, show it again, or see hidden recipes.
-- Other contributors and visitors don't get hidden recipes at all.
--
-- What it sets up:
--   private.site_owner            the owner's account (nobody can read it from the site).
--   public.hidden_recipes         the ids of hidden recipes. Nobody can read the
--                                 list from the site; only the owner can change it.
--   public.hidden_among(ids)      given recipe ids the site already knows (the ones
--                                 in recipes.js), says which are hidden. It can't
--                                 list hidden recipes, so their names never leak.
--   public.am_i_site_owner()      lets the site ask "is the signed-in person the owner?"
--   public.review_stats           (updated) the ratings totals now leave out
--                                 hidden recipes too.
--   public.owner_set_recipe_hidden(id, hidden)
--                                 hides or shows one recipe (owner only). Works for
--                                 recipes added on the site and ones in recipes.js.
--   public.owner_hidden_recipes() hidden recipes added on the site (owner only), so
--                                 the owner can still open, edit and show them.
--
-- Hidden recipes are not deleted. Their reviews and edits are kept, and so is
-- their category: the site lists them under "Hidden" and puts them back in
-- their own category when they are shown again.

create table if not exists private.site_owner (
  user_id  uuid primary key references auth.users (id) on delete cascade
);

create or replace function private.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_contributor()
     and exists (select 1 from private.site_owner o where o.user_id = auth.uid());
$$;

create or replace function public.am_i_site_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_owner();
$$;

create table if not exists public.hidden_recipes (
  id         text primary key
             check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(id) <= 80),
  hidden_at  timestamptz not null default now()
);

alter table public.hidden_recipes enable row level security;

-- No policies: the list can't be read from the site at all.
drop policy if exists "Anyone can read hidden recipe ids" on public.hidden_recipes;
revoke all on public.hidden_recipes from anon, authenticated;

create or replace function public.recipe_is_hidden(p_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.hidden_recipes h where h.id = p_id);
$$;

create or replace function public.hidden_among(p_ids text[])
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(h.id), '{}')
  from public.hidden_recipes h
  where p_ids is not null
    and cardinality(p_ids) <= 1000
    and h.id = any (p_ids);
$$;

revoke all on function public.recipe_is_hidden(text) from public;
revoke all on function public.hidden_among(text[]) from public;
grant execute on function public.recipe_is_hidden(text) to anon, authenticated;
grant execute on function public.hidden_among(text[]) to anon, authenticated;

-- Nobody (owner included) receives hidden recipes through the normal list;
-- the owner gets them through owner_hidden_recipes() below.
drop policy if exists "Visitors can read visible recipes" on public.recipes;
create policy "Visitors can read visible recipes"
  on public.recipes for select
  to anon, authenticated
  using (hidden = false and not public.recipe_is_hidden(id));

-- Earlier draft of this file used these names; remove them if present.
drop function if exists public.contributor_set_recipe_hidden(text, boolean);
drop function if exists public.contributor_hidden_recipes();

-- ---------- Ratings totals skip hidden recipes ----------
-- The same view as before (average and count per recipe, hidden reviews left
-- out, run with the visitor's own permissions), plus: hidden recipes are left
-- out, so their ids don't show up in the public totals.
create or replace view public.review_stats
with (security_invoker = true)
as
select recipe_id,
       round(avg(rating), 2) as avg_rating,
       (count(*))::integer as review_count
from public.reviews
where hidden = false
  and not public.recipe_is_hidden(recipe_id)
group by recipe_id;

-- ---------- Hide or show a recipe (owner only) ----------
create or replace function public.owner_set_recipe_hidden(p_id text, p_hidden boolean)
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

  if p_id is null or p_id !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(p_id) > 80
     or p_hidden is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  if p_hidden then
    insert into public.hidden_recipes (id) values (p_id)
    on conflict (id) do nothing;
  else
    delete from public.hidden_recipes where id = p_id;
  end if;

  return jsonb_build_object('ok', true, 'id', p_id, 'hidden', p_hidden);
end;
$$;

-- ---------- Hidden recipes added on the site (owner only) ----------
create or replace function public.owner_hidden_recipes()
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
    'recipes', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at desc)
      from public.recipes r
      join public.hidden_recipes h on h.id = r.id
      where r.hidden = false
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.am_i_site_owner() from public, anon;
revoke all on function public.owner_set_recipe_hidden(text, boolean) from public, anon;
revoke all on function public.owner_hidden_recipes() from public, anon;
grant execute on function public.am_i_site_owner() to authenticated;
grant execute on function public.owner_set_recipe_hidden(text, boolean) to authenticated;
grant execute on function public.owner_hidden_recipes() to authenticated;

-- ---------- The site owner ----------
-- Change YOUR-EMAIL@example.com to the email you sign in to the site with.
-- That account must already exist (invited and password set). To hand the
-- site to someone else later, run just this block again with their email.
do $$
declare
  v_email text := 'YOUR-EMAIL@example.com';
  v_id    uuid;
begin
  v_id := (select id from auth.users where lower(email) = lower(btrim(v_email)) limit 1);
  if v_id is null then
    raise exception 'No site account uses the email %. Change YOUR-EMAIL@example.com at the bottom of this file to the email you sign in with, then click Run again.', v_email;
  end if;
  delete from private.site_owner;
  insert into private.site_owner (user_id) values (v_id);
end;
$$;
