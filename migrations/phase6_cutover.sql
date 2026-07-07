-- Security Phase 6 — THE CUTOVER. Drops every legacy permissive policy so the
-- member-scoped (mem_*) and admin (adm_*, admins_*) policies from Phases 3–4 take
-- over. After this: anon has NO table access; authenticated members see only their
-- own company; admins (is_admin()) retain full access; settings/leads/audit/etc.
-- are admin-only. Also folds in the Phase 2 (public sign tables) + Phase 5 (storage
-- bucket) lockdowns so the whole cutover is one atomic apply.
--
-- ⚠️  APPLY ONLY AFTER the new frontend + api are deployed to PRODUCTION. Before
-- that, the live (old) bundle still uses the anon key for public sign pages and
-- whole-table portal loads, and would break. All additive migrations (phase3,
-- phase4) are already applied and are inert until this runs.

-- 1. Drop every policy that isn't one of ours (mem_*, adm_*, admins_*). This
--    removes all the `allow all` / `allow all auth` / `anon all *` / `public all`
--    / `authenticated_all_*` legacy policies in one sweep.
do $$
declare r record;
begin
  for r in
    select tablename, policyname from pg_policies
    where schemaname = 'public'
      and policyname not like 'mem\_%'
      and policyname not like 'adm\_%'
      and policyname not like 'admins\_%'
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- 2. Defense in depth: revoke base-table privileges from anon on every table, so
--    even a future stray permissive policy can't expose data to the anon key.
do $$
declare t text;
begin
  foreach t in array array[
    'tenants','spaces','leases','templates','invoices','discounts','maintenance',
    'settings','meta','leads','lead_pipeline_stages','referrers','members','fees',
    'bookings','portal_messages','esign_requests','documents','function_bookings',
    'event_bookings','food_orders','food_menu_items','mail_items','portal_events',
    'email_log','audit_log','member_pins','integrations'
  ] loop
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- 3. Phase 5 storage bucket lockdown (folded in): event-insurance goes private,
--    only admins touch it from the browser, reads are signed URLs.
update storage.buckets set public = false where id = 'event-insurance';
drop policy if exists anon_upload_event_insurance on storage.objects;
drop policy if exists public_read_event_insurance on storage.objects;
drop policy if exists authenticated_all_event_insurance on storage.objects;
drop policy if exists admin_all_event_insurance on storage.objects;
create policy admin_all_event_insurance on storage.objects for all to authenticated
  using (bucket_id = 'event-insurance' and public.is_admin())
  with check (bucket_id = 'event-insurance' and public.is_admin());

-- 4. Keep the booking_availability view readable by members (grant survives, but
--    re-assert in case grants were reset). anon gets nothing.
grant select on public.booking_availability to authenticated;
revoke all on public.booking_availability from anon;
