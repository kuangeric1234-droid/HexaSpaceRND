-- ============================================================================
-- Hexa Space RND — one-shot database setup
-- Paste this ENTIRE file into the Supabase SQL Editor (project ihvhnsdsvjwpyquvetzz)
-- and click Run. Designed for a FRESH project; run once.
-- ============================================================================

-- ── Tables the app uses that were missing from the original schema files ──
create table if not exists leads                ( id text primary key, data jsonb not null, updated_at timestamptz default now() );
create table if not exists lead_pipeline_stages ( id text primary key, data jsonb not null, updated_at timestamptz default now() );
create table if not exists referrers            ( id text primary key, data jsonb not null, updated_at timestamptz default now() );

alter table leads                enable row level security;
alter table lead_pipeline_stages enable row level security;
alter table referrers            enable row level security;

create policy "allow all" on leads                for all to anon using (true) with check (true);
create policy "allow all" on lead_pipeline_stages for all to anon using (true) with check (true);
create policy "allow all" on referrers            for all to anon using (true) with check (true);

-- Default CRM pipeline stages (so the Enquiries board has columns)
insert into lead_pipeline_stages (id, data) values
  ('stage_new',       '{"id":"stage_new","name":"New","category":"new","order":0}'),
  ('stage_contacted', '{"id":"stage_contacted","name":"Contacted","category":"in-progress","order":1}'),
  ('stage_tour',      '{"id":"stage_tour","name":"Tour booked","category":"in-progress","order":2}'),
  ('stage_won',       '{"id":"stage_won","name":"Won","category":"closed","order":3}'),
  ('stage_lost',      '{"id":"stage_lost","name":"Lost","category":"closed","order":4}')
on conflict (id) do nothing;


-- ==== supabase-schema.sql ====
-- HexaHub Database Schema
-- Run this in Supabase SQL Editor

create table if not exists tenants (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);

create table if not exists spaces (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);

create table if not exists leases (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);

create table if not exists templates (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);

create table if not exists invoices (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);

create table if not exists discounts (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);

create table if not exists settings (
  id text primary key default 'global',
  data jsonb not null,
  updated_at timestamptz default now()
);

create table if not exists meta (
  key text primary key,
  value text,
  updated_at timestamptz default now()
);

-- Enable Row Level Security but allow all for anon key (internal tool)
alter table tenants enable row level security;
alter table spaces enable row level security;
alter table leases enable row level security;
alter table templates enable row level security;
alter table invoices enable row level security;
alter table discounts enable row level security;
alter table settings enable row level security;
alter table meta enable row level security;

-- Allow full access for anon key (portal is protected by login)
create policy "allow all" on tenants for all to anon using (true) with check (true);
create policy "allow all" on spaces for all to anon using (true) with check (true);
create policy "allow all" on leases for all to anon using (true) with check (true);
create policy "allow all" on templates for all to anon using (true) with check (true);
create policy "allow all" on invoices for all to anon using (true) with check (true);
create policy "allow all" on discounts for all to anon using (true) with check (true);
create policy "allow all" on settings for all to anon using (true) with check (true);
create policy "allow all" on meta for all to anon using (true) with check (true);

-- ==== event-bookings-schema.sql ====
-- Run this in the Supabase SQL editor
CREATE TABLE IF NOT EXISTS event_bookings (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE event_bookings ENABLE ROW LEVEL SECURITY;

-- Admins (authenticated users) have full access
CREATE POLICY "authenticated_all_event_bookings"
  ON event_bookings FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

-- Public can read (sign page loads booking by token, no login)
CREATE POLICY "anon_select_event_bookings"
  ON event_bookings FOR SELECT
  TO anon
  USING (true);

-- Public can update (organiser signs without being logged in)
CREATE POLICY "anon_update_event_bookings"
  ON event_bookings FOR UPDATE
  TO anon
  USING (true) WITH CHECK (true);

-- ==== maintenance-schema.sql ====
-- Run in Supabase SQL Editor to create the maintenance table

create table if not exists maintenance (
  id text primary key,
  data jsonb not null default '{}',
  updated_at timestamptz default now()
);

alter table maintenance enable row level security;

drop policy if exists "public all maintenance" on maintenance;
drop policy if exists "auth all maintenance" on maintenance;

create policy "public all maintenance" on maintenance for all to anon using (true) with check (true);
create policy "auth all maintenance" on maintenance for all to authenticated using (true) with check (true);

-- ==== portal-schema.sql ====
-- Portal messages: tenant <-> admin thread
create table if not exists portal_messages (
  id text primary key,
  data jsonb not null
);
alter table portal_messages enable row level security;
create policy "anon all portal_messages" on portal_messages
  for all to anon using (true) with check (true);
create policy "auth all portal_messages" on portal_messages
  for all to authenticated using (true) with check (true);

-- Portal events: admin-managed events shown to members
create table if not exists portal_events (
  id text primary key,
  data jsonb not null
);
alter table portal_events enable row level security;
create policy "anon all portal_events" on portal_events
  for all to anon using (true) with check (true);
create policy "auth all portal_events" on portal_events
  for all to authenticated using (true) with check (true);

-- ==== reports-schema.sql ====
-- Run in Supabase SQL Editor

-- Email activity log
create table if not exists email_log (
  id text primary key,
  data jsonb not null default '{}',
  updated_at timestamptz default now()
);
alter table email_log enable row level security;
create policy "anon all email_log" on email_log for all to anon using (true) with check (true);
create policy "auth all email_log" on email_log for all to authenticated using (true) with check (true);

-- Audit log
create table if not exists audit_log (
  id text primary key,
  data jsonb not null default '{}',
  updated_at timestamptz default now()
);
alter table audit_log enable row level security;
create policy "anon all audit_log" on audit_log for all to anon using (true) with check (true);
create policy "auth all audit_log" on audit_log for all to authenticated using (true) with check (true);

-- Documents
create table if not exists documents (
  id text primary key,
  data jsonb not null default '{}',
  updated_at timestamptz default now()
);
alter table documents enable row level security;
create policy "anon all documents" on documents for all to anon using (true) with check (true);
create policy "auth all documents" on documents for all to authenticated using (true) with check (true);

-- ==== esign-schema.sql ====
-- Run this in Supabase SQL Editor
drop policy if exists "public all" on esign_requests;
drop table if exists esign_requests;

create table esign_requests (
  token text primary key,
  lease_id text not null,
  tenant_id text,
  status text default 'pending',
  licensee_signature_data text,
  licensee_signer_name text,
  licensee_signed_at timestamptz,
  licensor_signature_data text,
  licensor_signer_name text,
  licensor_signed_at timestamptz,
  created_at timestamptz default now()
);

alter table esign_requests enable row level security;
create policy "public all" on esign_requests for all to anon using (true) with check (true);
create policy "auth all esign" on esign_requests for all to authenticated using (true) with check (true);

-- ==== event-insurance-storage.sql ====
-- Run this entire file in Supabase SQL editor.
-- It creates the bucket AND the policies in one go. Safe to re-run.

-- Step 1: Create the bucket (safe to re-run — does nothing if it already exists)
INSERT INTO storage.buckets (id, name, public)
VALUES ('event-insurance', 'event-insurance', true)
ON CONFLICT (id) DO NOTHING;

-- Step 2: Policies (safe to re-run — drops existing ones first)

DROP POLICY IF EXISTS "anon_upload_event_insurance" ON storage.objects;
DROP POLICY IF EXISTS "public_read_event_insurance" ON storage.objects;
DROP POLICY IF EXISTS "authenticated_all_event_insurance" ON storage.objects;

CREATE POLICY "anon_upload_event_insurance"
ON storage.objects FOR INSERT TO anon
WITH CHECK (bucket_id = 'event-insurance');

CREATE POLICY "public_read_event_insurance"
ON storage.objects FOR SELECT TO anon
USING (bucket_id = 'event-insurance');

CREATE POLICY "authenticated_all_event_insurance"
ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'event-insurance')
WITH CHECK (bucket_id = 'event-insurance');
