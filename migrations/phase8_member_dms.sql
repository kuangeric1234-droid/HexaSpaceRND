-- Phase 8: member-to-member direct messages + sanitized community directory.
--
-- Adds a private DM table (participant-scoped, same convention as phase3/phase7)
-- and a cross-company directory VIEW that exposes ONLY name + company for opted-in
-- members (no emails / phones), so the community can find and message each other
-- WITHOUT reopening the broad member reads locked down in phase3.
-- Safe to re-run.

-- 1. DM table ---------------------------------------------------------------
create table if not exists public.member_messages (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);
alter table public.member_messages enable row level security;

-- Match the phase6 posture: anon has NO access (Supabase's default grants would
-- otherwise let the publishable key hit the table).
revoke all on public.member_messages from anon;

-- Read: only the sender or recipient (current_email() is already lowercased;
-- wrapped in (select ...) per the phase7 perf convention).
drop policy if exists mem_dm_sel on public.member_messages;
create policy mem_dm_sel on public.member_messages for select to authenticated
  using (
    lower(data->>'fromEmail') = (select public.current_email())
    or lower(data->>'toEmail') = (select public.current_email())
  );

-- Update: either participant (used to flag messages read).
drop policy if exists mem_dm_upd on public.member_messages;
create policy mem_dm_upd on public.member_messages for update to authenticated
  using (
    lower(data->>'fromEmail') = (select public.current_email())
    or lower(data->>'toEmail') = (select public.current_email())
  );

-- No member INSERT policy on purpose: rows are written by the service-role send
-- endpoint (api/members/message), which resolves the recipient's email
-- server-side so it is never exposed to the client. Reads/updates stay under the
-- RLS above.

create index if not exists member_messages_convo_idx on public.member_messages ((data->>'convoId'));
create index if not exists member_messages_to_idx   on public.member_messages ((data->>'toEmail'));
create index if not exists member_messages_from_idx on public.member_messages ((data->>'fromEmail'));

-- 2. Sanitized community directory view ------------------------------------
-- security_invoker = false → runs as owner, bypassing the per-company members
-- RLS. Exposes ONLY id + name + company for members who have portal access and
-- have NOT opted out of messaging. No email, no phone, no other profile data.
drop view if exists public.member_directory;
create view public.member_directory
  with (security_invoker = false) as
  select m.data->>'id'           as id,
         m.data->>'name'         as name,
         m.data->>'companyId'    as company_id,
         t.data->>'businessName' as company_name
  from public.members m
  left join public.tenants t on t.id = m.data->>'companyId'
  where coalesce(m.data->>'portalAccess', 'true') <> 'false'
    and coalesce(m.data->>'allowMessages', 'true') <> 'false';

-- Only signed-in members may read the directory. Revoke the default anon/public
-- grants so the publishable key can't scrape member names + companies.
revoke all on public.member_directory from anon, public;
grant select on public.member_directory to authenticated;
