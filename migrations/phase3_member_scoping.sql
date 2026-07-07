-- Security Phase 3 — member scoping (authenticated role).
--
-- ADDITIVE: these policies sit ALONGSIDE the existing permissive "allow all auth"
-- policies and are inert until those are dropped at the Phase 6 cutover. Safe to
-- apply live now. A "company" == a tenants row; a member links to it via
-- members.data.companyId == tenants.id. Identity comes from the verified JWT email.

-- ── Identity helpers ────────────────────────────────────────────────────────
-- current_email: the verified email from the caller's JWT (lowercased).
create or replace function public.current_email() returns text
  language sql stable
  as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;

-- current_company: the companyId (tenants.id) for the logged-in member. Runs as
-- owner (SECURITY DEFINER) so it can resolve email→company without being subject
-- to the very RLS it powers (no recursion). Falls back to a tenant whose primary
-- email matches (function-only / primary-contact clients with no member row).
create or replace function public.current_company() returns text
  language sql stable security definer set search_path = public
  as $$
    select coalesce(
      (select m.data->>'companyId' from members m
        where lower(m.data->>'email') = public.current_email()
          and coalesce(m.data->>'companyId','') <> '' limit 1),
      (select t.id from tenants t
        where lower(t.data->>'email') = public.current_email() limit 1)
    )
  $$;

grant execute on function public.current_email() to authenticated, anon;
grant execute on function public.current_company() to authenticated;

-- ── Per-table member policies ───────────────────────────────────────────────
-- Own company record (read + limited self-service update for credits).
drop policy if exists mem_sel_tenants on public.tenants;
create policy mem_sel_tenants on public.tenants for select to authenticated
  using (id = public.current_company());
drop policy if exists mem_upd_tenants on public.tenants;
create policy mem_upd_tenants on public.tenants for update to authenticated
  using (id = public.current_company()) with check (id = public.current_company());

-- Members of your own company (directory); update your own row; invite a teammate
-- into your own company.
drop policy if exists mem_sel_members on public.members;
create policy mem_sel_members on public.members for select to authenticated
  using (data->>'companyId' = public.current_company());
drop policy if exists mem_ins_members on public.members;
create policy mem_ins_members on public.members for insert to authenticated
  with check (data->>'companyId' = public.current_company());
drop policy if exists mem_upd_members on public.members;
create policy mem_upd_members on public.members for update to authenticated
  using (data->>'companyId' = public.current_company())
  with check (data->>'companyId' = public.current_company());

-- Read-only own-company financial/records.
drop policy if exists mem_sel_leases on public.leases;
create policy mem_sel_leases on public.leases for select to authenticated
  using (data->>'tenantId' = public.current_company());

drop policy if exists mem_sel_invoices on public.invoices;
create policy mem_sel_invoices on public.invoices for select to authenticated
  using (data->>'tenantId' = public.current_company());

drop policy if exists mem_sel_mail on public.mail_items;
create policy mem_sel_mail on public.mail_items for select to authenticated
  using (data->>'companyId' = public.current_company());

-- Fees: read own; create own (over-allowance booking fee).
drop policy if exists mem_sel_fees on public.fees;
create policy mem_sel_fees on public.fees for select to authenticated
  using (data->>'companyId' = public.current_company());
drop policy if exists mem_ins_fees on public.fees;
create policy mem_ins_fees on public.fees for insert to authenticated
  with check (data->>'companyId' = public.current_company());

-- Bookings: full read/write on OWN bookings. Cross-company availability is served
-- by the sanitized booking_availability view below — not by a table policy.
drop policy if exists mem_sel_bookings on public.bookings;
create policy mem_sel_bookings on public.bookings for select to authenticated
  using (data->>'companyId' = public.current_company());
drop policy if exists mem_ins_bookings on public.bookings;
create policy mem_ins_bookings on public.bookings for insert to authenticated
  with check (data->>'companyId' = public.current_company());
drop policy if exists mem_upd_bookings on public.bookings;
create policy mem_upd_bookings on public.bookings for update to authenticated
  using (data->>'companyId' = public.current_company())
  with check (data->>'companyId' = public.current_company());

-- Food orders: read + create own.
drop policy if exists mem_sel_food on public.food_orders;
create policy mem_sel_food on public.food_orders for select to authenticated
  using (data->>'companyId' = public.current_company());
drop policy if exists mem_ins_food on public.food_orders;
create policy mem_ins_food on public.food_orders for insert to authenticated
  with check (data->>'companyId' = public.current_company());

-- Function bookings: read + sign own.
drop policy if exists mem_sel_fnbk on public.function_bookings;
create policy mem_sel_fnbk on public.function_bookings for select to authenticated
  using (data->>'companyId' = public.current_company());
drop policy if exists mem_ins_fnbk on public.function_bookings;
create policy mem_ins_fnbk on public.function_bookings for insert to authenticated
  with check (data->>'companyId' = public.current_company());
drop policy if exists mem_upd_fnbk on public.function_bookings;
create policy mem_upd_fnbk on public.function_bookings for update to authenticated
  using (data->>'companyId' = public.current_company())
  with check (data->>'companyId' = public.current_company());

-- Portal messages: your own tenant thread (read / send / mark-read).
drop policy if exists mem_sel_msgs on public.portal_messages;
create policy mem_sel_msgs on public.portal_messages for select to authenticated
  using (data->>'tenantId' = public.current_company());
drop policy if exists mem_ins_msgs on public.portal_messages;
create policy mem_ins_msgs on public.portal_messages for insert to authenticated
  with check (data->>'tenantId' = public.current_company());
drop policy if exists mem_upd_msgs on public.portal_messages;
create policy mem_upd_msgs on public.portal_messages for update to authenticated
  using (data->>'tenantId' = public.current_company())
  with check (data->>'tenantId' = public.current_company());

-- Non-tenant / global reads that members legitimately need.
drop policy if exists mem_sel_spaces on public.spaces;
create policy mem_sel_spaces on public.spaces for select to authenticated using (true);

drop policy if exists mem_sel_portal_events on public.portal_events;
create policy mem_sel_portal_events on public.portal_events for select to authenticated using (true);

drop policy if exists mem_sel_food_menu on public.food_menu_items;
create policy mem_sel_food_menu on public.food_menu_items for select to authenticated using (true);

-- Templates: members may read document templates (T&Cs, House Rules, guides) but
-- NOT internal email templates.
drop policy if exists mem_sel_templates on public.templates;
create policy mem_sel_templates on public.templates for select to authenticated
  using (coalesce(data->>'category','document') <> 'email');

-- ── Sanitized cross-company availability view ───────────────────────────────
-- Room/studio availability needs OTHER companies' booked time-slots to grey out
-- busy cells + detect clashes, WITHOUT exposing who booked or why. This view
-- (security_invoker OFF → runs as owner, bypassing the per-tenant bookings RLS)
-- exposes only the slot shape: resource, date, times, status. No title, no
-- memberId, no companyId, no reference.
drop view if exists public.booking_availability;
create view public.booking_availability
  with (security_invoker = false) as
  select id,
         data->>'resourceId' as resource_id,
         data->>'date'       as date,
         data->>'startTime'  as start_time,
         data->>'endTime'    as end_time,
         data->>'status'     as status
  from public.bookings;

grant select on public.booking_availability to authenticated;
