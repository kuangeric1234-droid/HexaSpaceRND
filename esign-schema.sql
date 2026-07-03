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
  licensee_title text,
  licensee_date text,
  licensor_signature_data text,
  licensor_signer_name text,
  licensor_signed_at timestamptz,
  created_at timestamptz default now()
);

alter table esign_requests enable row level security;
create policy "public all" on esign_requests for all to anon using (true) with check (true);
create policy "auth all esign" on esign_requests for all to authenticated using (true) with check (true);
