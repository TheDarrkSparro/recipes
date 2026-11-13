-- The Dark Sparrow Eats: hide a recipe from the public site
-- Run this ONCE in Supabase, after add-accounts.sql: open the
-- dark-sparrow-eats project, go to SQL Editor, paste this whole file, and
-- click Run. It is safe to run again.
--
-- What it sets up:
--   public.hidden_recipes              the ids of hidden recipes. Anyone can
--                                      read the list (the site needs it to leave
--                                      those recipes out); only contributors can
--                                      change it.
--   public.contributor_set_recipe_hidden(id, hidden)
--                                      hides or shows one recipe. Works for
--                                      recipes added on the site and for the
--                                      ones written in recipes.js.
--   public.contributor_hidden_recipes()
--                                      lets a signed-in contributor still open
--                                      hidden recipes that were added on the site,
--                                      so they can check, edit and show them again.
--
-- Hidden recipes are not deleted. Their reviews and edits are kept.

create table if not exists public.hidden_recipes (
  id         text primary key
             check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(id) <= 80),
  hidden_at  timestamptz not null default now()
);

alter table public.hidden_recipes enable row level security;

drop policy if exists "Anyone can read hidden recipe ids" on public.hidden_recipes;
create policy "Anyone can read hidden recipe ids"
  on public.hidden_recipes for select
  to anon, authenticated
  using (true);

revoke all on public.hidden_recipes from anon, authenticated;
grant select on public.hidden_recipes to anon, authenticated;

-- Visitors no longer receive recipes that are on the hidden list.
drop policy if exists "Visitors can read visible recipes" on public.recipes;
create policy "Visitors can read visible recipes"
  on public.recipes for select
  to anon, authenticated
  using (
    hidden = false
    and not exists (select 1 from public.hidden_recipes h where h.id = recipes.id)
  );

-- ---------- Hide or show a recipe ----------
create or replace function public.contributor_set_recipe_hidden(p_id text, p_hidden boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_contributor() then
    return private.contributor_error();
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

-- ---------- Hidden recipes added on the site, for contributors ----------
create or replace function public.contributor_hidden_recipes()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_contributor() then
    return private.contributor_error();
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

revoke all on function public.contributor_set_recipe_hidden(text, boolean) from public, anon;
revoke all on function public.contributor_hidden_recipes() from public, anon;
grant execute on function public.contributor_set_recipe_hidden(text, boolean) to authenticated;
grant execute on function public.contributor_hidden_recipes() to authenticated;
