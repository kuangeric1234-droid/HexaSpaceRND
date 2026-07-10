-- PaperCut auth-cutover straggler check — "does this member have a portal password?"
--
-- The Phase 5 auth switch (auth.source.custom-program → hexa-auth.cmd) validates
-- print sign-in against each member's Supabase Auth password. A member with NO
-- password set can't sign in to print after the flip (Mobility-Print first-run /
-- :9191 web portal only — card/tap release at the copier is unaffected). This
-- function answers, for a batch of emails, whether each has a password — so the
-- connector's active-printer list can be diffed to the actual lock-out risk set.
--
-- SECURITY DEFINER so it can read auth.users.encrypted_password WITHOUT exposing
-- that column to any client. Returns only a boolean per email, never the hash.
-- Execute is granted to service_role ONLY (the /api/papercut/has-password endpoint,
-- which is itself gated by PAPERCUT_SYNC_TOKEN). search_path is pinned empty and
-- auth.users is fully-qualified to prevent search_path hijacking of a definer proc.

create or replace function public.papercut_has_password(emails text[])
returns table (email text, has_password boolean)
language sql
security definer
set search_path = ''
as $$
  select lower(e) as email,
         exists (
           select 1
           from auth.users u
           where lower(u.email) = lower(e)
             and u.encrypted_password is not null
             and u.encrypted_password <> ''
         ) as has_password
  from unnest(emails) as e
$$;

revoke all on function public.papercut_has_password(text[]) from public, anon, authenticated;
grant execute on function public.papercut_has_password(text[]) to service_role;
