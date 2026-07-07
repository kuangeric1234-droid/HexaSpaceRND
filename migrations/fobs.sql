-- Fob & Remote tracker — device inventory, assignments (issue/return/deposit)
-- and portal requests. Follows the app's {id, data jsonb, updated_at} convention.
--
-- Deployed POST-cutover (Security Phase 6+7): RLS is on with admin (is_admin) and
-- member (current_company) scoped policies only — NO permissive "allow all auth"
-- policy. The scoped policies are guarded on their helper functions so this file
-- still applies cleanly on an earlier-phase DB (it just creates fewer policies).

create table if not exists public.fobs (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);
create table if not exists public.fob_assignments (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);
create table if not exists public.fob_requests (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);

alter table public.fobs            enable row level security;
alter table public.fob_assignments enable row level security;
alter table public.fob_requests    enable row level security;

grant select, insert, update, delete on public.fobs to authenticated;
grant select, insert, update, delete on public.fob_assignments to authenticated;
grant select, insert, update, delete on public.fob_requests to authenticated;

-- Drop any legacy permissive policies — this tracker ships post-cutover.
drop policy if exists all_auth_fobs on public.fobs;
drop policy if exists all_auth_fob_assignments on public.fob_assignments;
drop policy if exists all_auth_fob_requests on public.fob_requests;

-- ── Admin full access (Phase 4 is_admin model) ───────────────────────────────
do $$
begin
  if exists (select 1 from pg_proc where proname = 'is_admin') then
    execute 'drop policy if exists adm_all_fobs on public.fobs';
    execute 'create policy adm_all_fobs on public.fobs for all to authenticated using (public.is_admin()) with check (public.is_admin())';
    execute 'drop policy if exists adm_all_fob_assignments on public.fob_assignments';
    execute 'create policy adm_all_fob_assignments on public.fob_assignments for all to authenticated using (public.is_admin()) with check (public.is_admin())';
    execute 'drop policy if exists adm_all_fob_requests on public.fob_requests';
    execute 'create policy adm_all_fob_requests on public.fob_requests for all to authenticated using (public.is_admin()) with check (public.is_admin())';
  end if;
end $$;

-- ── Member scoping (Phase 3 current_company model) ───────────────────────────
-- Members read their own device assignments; read + create their own requests.
-- The fobs inventory stays admin-only — serials are echoed onto the assignment /
-- request rows the member can already see, so they never need the inventory table.
do $$
begin
  if exists (select 1 from pg_proc where proname = 'current_company') then
    execute 'drop policy if exists mem_sel_fob_assignments on public.fob_assignments';
    execute 'create policy mem_sel_fob_assignments on public.fob_assignments for select to authenticated using (data->>''companyId'' = public.current_company())';
    execute 'drop policy if exists mem_sel_fob_requests on public.fob_requests';
    execute 'create policy mem_sel_fob_requests on public.fob_requests for select to authenticated using (data->>''companyId'' = public.current_company())';
    execute 'drop policy if exists mem_ins_fob_requests on public.fob_requests';
    execute 'create policy mem_ins_fob_requests on public.fob_requests for insert to authenticated with check (data->>''companyId'' = public.current_company())';
  end if;
end $$;
