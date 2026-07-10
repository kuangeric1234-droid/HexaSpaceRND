-- Salto remote-open audit log — run in Supabase SQL Editor (safe to re-run).
--
-- Every remote-unlock attempt from the member app (api/salto/open.js) writes a
-- row here; the Zapier zap calls back to api/salto/open-callback.js to flip the
-- result from 'dispatched' to the real 'opened'/'failed'. The admin Access log
-- page (api/salto/open-log.js) reads it.
--
-- SECURITY: this is an audit trail of physical door activity. RLS is enabled with
-- NO anon/authenticated policy, so only the service role (the api/ handlers) can
-- read or write it. Do NOT add a permissive "anon all" policy — the app/portal
-- fetch whole tables client-side and that would expose the whole building's
-- door activity to any signed-in member.

create table if not exists salto_open_log (
  id text primary key,               -- so_<ts>_<rand>; also the webhook requestId
  email text,                        -- member who tapped (lowercased)
  member_id text,
  company_id text,
  space_id text,                     -- office/room space id (null for entry doors)
  lock_id text,                      -- Salto KS lock id actually targeted
  kind text,                         -- 'office' | 'entry' | 'room'
  door_label text,                   -- human label at time of open (e.g. "Office 11")
  booking_ref text,                  -- room opens only
  result text,                       -- 'dispatched' | 'opened' | 'failed' | 'mock'
  at timestamptz default now()
);

-- Columns added after the table's original ad-hoc creation — safe to re-run.
alter table salto_open_log add column if not exists kind text;
alter table salto_open_log add column if not exists door_label text;
alter table salto_open_log add column if not exists booking_ref text;

create index if not exists salto_open_log_at_idx on salto_open_log (at desc);
create index if not exists salto_open_log_company_idx on salto_open_log (company_id);

alter table salto_open_log enable row level security;

-- No anon/authenticated policies on purpose (see note above). Drop any that a
-- previous permissive run may have created:
drop policy if exists "anon all salto_open_log" on salto_open_log;
drop policy if exists "auth all salto_open_log" on salto_open_log;
