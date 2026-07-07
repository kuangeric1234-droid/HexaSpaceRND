-- Security Phase 4 — real admin identity at the DB level.
--
-- Today admin-vs-member is decided purely client-side (email in settings.adminUsers),
-- and an admin's JWT is an indistinguishable `authenticated` role. This adds a
-- DB-enforced admin identity: an `admins` allow-list + is_admin(), plus admin
-- full-access policies on every table. ADDITIVE — sits alongside the permissive
-- policies until the Phase 6 cutover, so safe to apply live.

-- ── Admins allow-list ───────────────────────────────────────────────────────
create table if not exists public.admins (
  email    text primary key,
  name     text,
  role     text,
  added_at timestamptz default now()
);
alter table public.admins enable row level security;

-- is_admin(): true when the caller's verified email is in the allow-list. Runs as
-- owner so it can read `admins` without being gated by the admins RLS below.
create or replace function public.is_admin() returns boolean
  language sql stable security definer set search_path = public
  as $$ select exists(select 1 from admins a where lower(a.email) = public.current_email()) $$;
grant execute on function public.is_admin() to authenticated, anon;

-- A signed-in user may check only their OWN admin row (role determination);
-- admins may read the whole list; only admins may modify it.
drop policy if exists admins_self_read on public.admins;
create policy admins_self_read on public.admins for select to authenticated
  using (lower(email) = public.current_email());
drop policy if exists admins_admin_read on public.admins;
create policy admins_admin_read on public.admins for select to authenticated
  using (public.is_admin());
drop policy if exists admins_admin_write on public.admins;
create policy admins_admin_write on public.admins for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.admins to authenticated;

-- ── Seed the allow-list from the current settings + hardcoded fallback ───────
insert into public.admins (email, name, role)
  select lower(u->>'email'), u->>'name', u->>'role'
  from settings s, jsonb_array_elements(coalesce(s.data->'adminUsers','[]'::jsonb)) u
  where s.id = 'global' and coalesce(u->>'email','') <> ''
  on conflict (email) do nothing;
insert into public.admins (email, role) values
  ('admin@hexaspace.com.au','Super Admin'),
  ('eric@hexaspace.com.au','Super Admin'),
  ('info@hexaspace.com.au','Super Admin')
  on conflict (email) do nothing;

-- Keep the allow-list in sync with the Settings → Admin Users UI (which edits
-- settings.data.adminUsers) — no UI change needed. The three fallback admins are
-- never auto-removed.
create or replace function public.sync_admins_from_settings() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if NEW.id = 'global' then
    insert into admins(email, name, role)
      select lower(u->>'email'), u->>'name', u->>'role'
      from jsonb_array_elements(coalesce(NEW.data->'adminUsers','[]'::jsonb)) u
      where coalesce(u->>'email','') <> ''
      on conflict(email) do update set name = excluded.name, role = excluded.role;
    delete from admins a
      where a.email not in (
              select lower(u->>'email')
              from jsonb_array_elements(coalesce(NEW.data->'adminUsers','[]'::jsonb)) u
              where coalesce(u->>'email','') <> '')
        and a.email not in ('admin@hexaspace.com.au','eric@hexaspace.com.au','info@hexaspace.com.au');
  end if;
  return NEW;
end $$;
drop trigger if exists trg_sync_admins on public.settings;
create trigger trg_sync_admins after insert or update on public.settings
  for each row execute function public.sync_admins_from_settings();

-- ── Admin full-access policies on every table the admin app touches ─────────
-- (member_pins + integrations stay service-role-only.)
do $$
declare t text;
begin
  foreach t in array array[
    'tenants','spaces','leases','templates','invoices','discounts','maintenance',
    'settings','meta','leads','lead_pipeline_stages','referrers','members','fees',
    'bookings','portal_messages','esign_requests','documents','function_bookings',
    'event_bookings','food_orders','food_menu_items','mail_items','portal_events',
    'email_log','audit_log'
  ] loop
    execute format('drop policy if exists adm_all_%I on public.%I', t, t);
    execute format('create policy adm_all_%I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t, t);
  end loop;
end $$;
