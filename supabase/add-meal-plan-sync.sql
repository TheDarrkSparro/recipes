-- The Dark Sparrow Eats: meal plan and shopping list saved to your account
-- Run this ONCE in Supabase: open the dark-sparrow-eats project, go to SQL
-- Editor, paste this whole file, and click Run. It is safe to run again.
--
-- Signed-in people's meal plans and shopping lists are kept here, so they
-- can plan on one device and shop with another. Each person can only see and
-- change their own row. People who aren't signed in keep their plan on their
-- own device only, as before.

create table if not exists public.meal_plans (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  plan        jsonb not null default '{}'::jsonb,   -- { "YYYY-MM-DD": { breakfast, lunch, dinner } }
  shopping    jsonb not null default '{}'::jsonb,   -- { "<week start>": { have, extras } }
  updated_at  timestamptz not null default now(),
  constraint meal_plans_size check (pg_column_size(plan) + pg_column_size(shopping) < 1000000)
);

alter table public.meal_plans enable row level security;

drop policy if exists "Read your own meal plan" on public.meal_plans;
create policy "Read your own meal plan"
  on public.meal_plans for select
  to authenticated
  using (user_id = auth.uid());

revoke all on public.meal_plans from anon, authenticated;
grant select on public.meal_plans to authenticated;

-- Saves only what changed: p_days replaces those days of the plan (null
-- removes a day), p_shopping replaces those weeks of the shopping list. So a
-- phone ticking items at the store and a laptop planning next week don't
-- overwrite each other.
create or replace function public.save_meal_plan(p_days jsonb default '{}'::jsonb, p_shopping jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  if jsonb_typeof(coalesce(p_days, '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_shopping, '{}'::jsonb)) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  insert into public.meal_plans (user_id) values (v_uid)
  on conflict (user_id) do nothing;

  update public.meal_plans m set
    plan       = jsonb_strip_nulls(m.plan || coalesce(p_days, '{}'::jsonb)),
    shopping   = jsonb_strip_nulls(m.shopping || coalesce(p_shopping, '{}'::jsonb)),
    updated_at = now()
  where m.user_id = v_uid;

  return jsonb_build_object('ok', true);
exception
  when check_violation then
    return jsonb_build_object('ok', false, 'error', 'too_big');
end;
$$;

revoke all on function public.save_meal_plan(jsonb, jsonb) from public, anon;
grant execute on function public.save_meal_plan(jsonb, jsonb) to authenticated;
