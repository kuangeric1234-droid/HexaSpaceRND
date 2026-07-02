-- Function Space Bookings — run once in the Supabase SQL editor.
-- Same { id, data (jsonb), updated_at } shape as every other table in the app.
create table if not exists public.function_bookings (
  id          text primary key,
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);

alter table public.function_bookings enable row level security;

-- Authenticated admins: full access.
drop policy if exists "function_bookings admin all" on public.function_bookings;
create policy "function_bookings admin all"
  on public.function_bookings for all
  to authenticated
  using (true) with check (true);

-- Anonymous (public agreement/sign page + website enquiry form): read + write.
-- The record is only reachable by knowing its unguessable signingToken.
drop policy if exists "function_bookings anon all" on public.function_bookings;
create policy "function_bookings anon all"
  on public.function_bookings for all
  to anon
  using (true) with check (true);
