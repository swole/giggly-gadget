-- 0009: trips. Someone travelling misses a run of meals, from (from_date, from_slot) to
-- (to_date, to_slot) inclusive. Readers take the traveller out of each meal's eaters at read
-- time (lib/plan/travel.ts), so a trip never rewrites planned_meals and deleting one puts the
-- week back as it was. Anon reads (Realtime to the phones); writes go through /api/plan/trips
-- with the service role. Apply by hand (pg-meta route or SQL editor). Safe to re-run.
begin;

create table if not exists trips (
  id bigserial primary key,
  person text not null check (person in ('johnny', 'lydia')),
  from_date date not null,
  from_slot text not null check (from_slot in ('breakfast', 'lunch', 'dinner', 'snack')),
  to_date date not null,
  to_slot text not null check (to_slot in ('breakfast', 'lunch', 'dinner', 'snack')),
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trips_dates_in_order check (to_date >= from_date)
);

create index if not exists trips_date_range on trips (from_date, to_date);

alter table trips enable row level security;
drop policy if exists "anon read" on trips;
create policy "anon read" on trips for select using (true);

-- Realtime: full replica identity so DELETE events carry the row; publish the table.
alter table trips replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trips'
  ) then
    alter publication supabase_realtime add table trips;
  end if;
end $$;

commit;

-- Post-check:
--   select tablename from pg_publication_tables where pubname = 'supabase_realtime';  -- includes trips
--   select policyname, cmd from pg_policies where tablename = 'trips';                -- "anon read" / SELECT
