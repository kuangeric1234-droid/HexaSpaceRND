-- Security Phase 2 — public pages off the anon key.
--
-- The public token pages (SignPage, FunctionSignPage, EventBookingSignPage) now
-- read/write exclusively through token-verifying serverless endpoints
-- (api/sign/*, api/function-bookings/{load,sign}, api/event-bookings/{load,save,upload}),
-- which use the service role. No public page touches these tables with the anon
-- key any more, so anon loses all access to them.
--
-- CUTOVER-GATED: apply only AFTER the new frontend + endpoints are deployed to
-- production, or the currently-live sign pages (still using the anon key) break.
-- All other consumers of these tables are `authenticated` (admin / portal), so
-- authenticated access is untouched here.

-- esign_requests: drop the anon ALL policy ("public all").
drop policy if exists "public all" on public.esign_requests;

-- event_bookings: drop the anon SELECT + UPDATE policies.
drop policy if exists "anon_select_event_bookings" on public.event_bookings;
drop policy if exists "anon_update_event_bookings" on public.event_bookings;

-- function_bookings: drop the anon ALL policy.
drop policy if exists "function_bookings anon all" on public.function_bookings;

-- Belt-and-braces: revoke base-table privileges from anon so PostgREST cannot
-- reach these even if a stray permissive policy is ever re-added.
revoke all on public.esign_requests   from anon;
revoke all on public.event_bookings   from anon;
revoke all on public.function_bookings from anon;
