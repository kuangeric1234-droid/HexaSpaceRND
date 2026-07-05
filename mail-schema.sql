-- Mail & Deliveries register — run in Supabase SQL Editor (safe to re-run)
create table if not exists mail_items (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);

alter table mail_items enable row level security;
drop policy if exists "anon all mail" on mail_items;
create policy "anon all mail" on mail_items for all to anon using (true) with check (true);
drop policy if exists "auth all mail" on mail_items;
create policy "auth all mail" on mail_items for all to authenticated using (true) with check (true);
