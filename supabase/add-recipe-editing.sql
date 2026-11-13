-- The Dark Sparrow Eats: editing recipes from the web page
-- Run this ONCE in Supabase, after add-recipes-table.sql: open the
-- dark-sparrow-eats project, go to SQL Editor, paste this whole file, and
-- click Run. It is safe to run again.
--
-- What it sets up:
--   public.update_recipe()   saves changes to a recipe. It checks your owner
--                            code first (same code and lock-out as saving a
--                            new recipe).
--
-- Recipes added on the site are changed in place. For the recipes written in
-- recipes.js, the edited version is saved here under the same id, and the site
-- shows it instead of the one in recipes.js. A recipe that was hidden stays
-- hidden.

create or replace function public.update_recipe(p_code text, p_id text, p_recipe jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash   text;
  v_title  text;
  v_time   integer;
begin
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

revoke all on function public.update_recipe(text, text, jsonb) from public;
grant execute on function public.update_recipe(text, text, jsonb) to anon, authenticated;
