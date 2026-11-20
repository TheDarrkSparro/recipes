-- The Dark Sparrow Eats: site suggestions (signed-in contributors suggest
-- improvements to the WEBSITE itself -- new features, fixes, ideas; not recipe
-- edits, which have their own Edit button).
--
-- Run this ONCE in Supabase, after add-accounts.sql and add-recipe-hiding.sql
-- (it uses private.is_contributor() from the first and private.is_owner() from
-- the second): open the dark-sparrow-eats project, go to SQL Editor, paste this
-- whole file, and click Run. It is safe to run again.
--
-- What it adds:
--   public.site_suggestions            one row per suggestion (owner reads via
--                                       the owner_* functions; nobody reads the
--                                       table directly from the site).
--   public.suggest_improvement(...)    a signed-in contributor files one.
--   public.my_suggestions()            a contributor sees their own + status.
--   public.owner_list_suggestions()    the owner sees every suggestion.
--   public.owner_set_suggestion_status(...)  the owner sets status / a note.
--   public.owner_delete_suggestion(...)      the owner removes one.
--
-- Reading recipes, leaving reviews, adding and editing recipes are unchanged.

-- ---------- The table ----------
create table if not exists public.site_suggestions (
  id                bigint generated always as identity primary key,
  kind              text not null default 'idea'
                      check (kind in ('idea', 'problem', 'other')),
  title             text not null
                      check (btrim(title) <> '' and length(title) <= 120),
  details           text
                      check (details is null or length(details) <= 4000),
  status            text not null default 'new'
                      check (status in ('new', 'planned', 'done', 'declined')),
  owner_note        text
                      check (owner_note is null or length(owner_note) <= 2000),
  created_by        uuid not null default auth.uid()
                      references auth.users (id) on delete cascade,
  created_by_email  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists site_suggestions_created_by_idx
  on public.site_suggestions (created_by);
create index if not exists site_suggestions_status_idx
  on public.site_suggestions (status, created_at desc);

-- Locked down: the site only reaches this table through the functions below.
alter table public.site_suggestions enable row level security;
drop policy if exists "no direct access" on public.site_suggestions;
revoke all on public.site_suggestions from anon, authenticated;

-- ---------- File a suggestion (any signed-in contributor) ----------
create or replace function public.suggest_improvement(
  p_kind text, p_title text, p_details text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind    text;
  v_title   text;
  v_details text;
  v_email   text;
  v_id      bigint;
begin
  if not private.is_contributor() then
    return private.contributor_error();
  end if;

  v_kind := lower(btrim(coalesce(p_kind, '')));
  if v_kind not in ('idea', 'problem', 'other') then
    v_kind := 'idea';
  end if;

  v_title := btrim(coalesce(p_title, ''));
  if v_title = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_title');
  end if;
  if length(v_title) > 120 then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  v_details := nullif(btrim(coalesce(p_details, '')), '');
  if v_details is not null and length(v_details) > 4000 then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  -- Gentle limit: no more than 10 from one account in an hour.
  if (select count(*) from public.site_suggestions
      where created_by = auth.uid()
        and created_at > now() - interval '1 hour') >= 10 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  select u.email into v_email from auth.users u where u.id = auth.uid();

  insert into public.site_suggestions (kind, title, details, created_by_email)
  values (v_kind, v_title, v_details, v_email)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
exception
  when check_violation or string_data_right_truncation then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
end;
$$;

-- ---------- A contributor's own suggestions ----------
create or replace function public.my_suggestions()
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
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'kind', s.kind,
        'title', s.title,
        'details', s.details,
        'status', s.status,
        'owner_note', s.owner_note,
        'created_at', s.created_at
      ) order by s.created_at desc)
      from public.site_suggestions s
      where s.created_by = auth.uid()
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------- Every suggestion (owner only) ----------
create or replace function public.owner_list_suggestions()
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
  if not private.is_owner() then
    return jsonb_build_object('ok', false, 'error', 'not_owner');
  end if;

  return jsonb_build_object(
    'ok', true,
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'kind', s.kind,
        'title', s.title,
        'details', s.details,
        'status', s.status,
        'owner_note', s.owner_note,
        'from', s.created_by_email,
        'created_at', s.created_at,
        'updated_at', s.updated_at
      ) order by
        case s.status when 'new' then 0 when 'planned' then 1
                      when 'done' then 2 else 3 end,
        s.created_at desc)
      from public.site_suggestions s
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------- Set a suggestion's status / note (owner only) ----------
create or replace function public.owner_set_suggestion_status(
  p_id bigint, p_status text, p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_note   text;
begin
  if not private.is_contributor() then
    return private.contributor_error();
  end if;
  if not private.is_owner() then
    return jsonb_build_object('ok', false, 'error', 'not_owner');
  end if;

  v_status := lower(btrim(coalesce(p_status, '')));
  if v_status not in ('new', 'planned', 'done', 'declined') then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  v_note := nullif(btrim(coalesce(p_note, '')), '');
  if v_note is not null and length(v_note) > 2000 then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  update public.site_suggestions
    set status = v_status, owner_note = v_note, updated_at = now()
    where id = p_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  return jsonb_build_object('ok', true, 'id', p_id, 'status', v_status);
end;
$$;

-- ---------- Delete a suggestion (owner only) ----------
create or replace function public.owner_delete_suggestion(p_id bigint)
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

  delete from public.site_suggestions where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  return jsonb_build_object('ok', true, 'id', p_id);
end;
$$;

-- Only signed-in people may call these (the checks inside do the rest).
revoke all on function public.suggest_improvement(text, text, text) from public, anon;
revoke all on function public.my_suggestions() from public, anon;
revoke all on function public.owner_list_suggestions() from public, anon;
revoke all on function public.owner_set_suggestion_status(bigint, text, text) from public, anon;
revoke all on function public.owner_delete_suggestion(bigint) from public, anon;
grant execute on function public.suggest_improvement(text, text, text) to authenticated;
grant execute on function public.my_suggestions() to authenticated;
grant execute on function public.owner_list_suggestions() to authenticated;
grant execute on function public.owner_set_suggestion_status(bigint, text, text) to authenticated;
grant execute on function public.owner_delete_suggestion(bigint) to authenticated;
