-- The Dark Sparrow Eats: email Art a short notice whenever an invite is sent.
--
-- Supabase can't CC its own auth emails, so this watches for new or re-sent
-- invitations (auth.users.invited_at changes) and sends a one-line notice
-- through Resend's API.
--
-- Setup (once):
--   1. Run this file in the Supabase SQL Editor.
--   2. In Resend, create an API key with "Sending access" (API keys → Create).
--   3. In the Supabase SQL Editor, run (with your own key in place of re_...):
--        select vault.create_secret('re_...', 'resend_api_key');
--      Until that secret exists, invites still work; only the notice is skipped.
--
-- The notice never blocks or delays an invite: pg_net sends it in the
-- background, and any error is ignored.

create extension if not exists pg_net with schema extensions;

create or replace function public.notify_owner_of_invite()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  api_key text;
  sent_at text;
begin
  -- Only when an invitation was just sent (new invite or a re-send).
  if new.invited_at is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.invited_at is not distinct from old.invited_at then
    return new;
  end if;

  begin
    select decrypted_secret into api_key
    from vault.decrypted_secrets
    where name = 'resend_api_key'
    limit 1;

    if api_key is null then
      return new;
    end if;

    sent_at := to_char(new.invited_at at time zone 'America/Los_Angeles', 'FMMon FMDD, YYYY "at" FMHH12:MI AM') || ' Pacific';

    perform net.http_post(
      url := 'https://api.resend.com/emails',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || api_key,
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'from', 'The Dark Sparrow Eats <hello@darksparroweats.com>',
        'to', jsonb_build_array('the.dark.sparro@gmail.com'),
        'subject', 'Invite sent to ' || coalesce(new.email, 'a new contributor'),
        'text',
          'An invitation to The Dark Sparrow Eats was just sent.' || chr(10) || chr(10) ||
          'To: ' || coalesce(new.email, '(no email)') || chr(10) ||
          'When: ' || sent_at || chr(10) ||
          case when tg_op = 'UPDATE' then 'This was a re-sent invitation.' || chr(10) else '' end ||
          chr(10) || 'Delivery status: https://resend.com/emails'
      )
    );
  exception when others then
    -- A notice problem must never stop an invite.
    null;
  end;

  return new;
end;
$$;

revoke all on function public.notify_owner_of_invite() from public, anon, authenticated;

drop trigger if exists notify_owner_of_invite on auth.users;
create trigger notify_owner_of_invite
  after insert or update of invited_at on auth.users
  for each row
  execute function public.notify_owner_of_invite();
