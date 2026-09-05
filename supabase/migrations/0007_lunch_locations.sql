-- 0007: lunch_locations. Per day, per person: is lunch eaten at home or packed for the office?
-- No row = home. Johnny and Lydia toggle it from the week grid; the kitchen, the WhatsApp
-- digest and the print sheet read it so Shallaine knows what to pack.
-- Apply by hand in the Supabase SQL editor (same as 0003-0006). Safe to re-run.
begin;

create table if not exists lunch_locations (
  planned_for date not null,
  person text not null check (person in ('johnny', 'lydia')),
  location text not null check (location in ('home', 'office')),
  updated_by text,
  updated_at timestamptz not null default now(),
  primary key (planned_for, person)
);

alter table lunch_locations enable row level security;
drop policy if exists "anon all" on lunch_locations;
create policy "anon all" on lunch_locations for all using (true) with check (true);

-- Realtime: full replica identity so DELETE events carry the row; publish the table.
alter table lunch_locations replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'lunch_locations'
  ) then
    alter publication supabase_realtime add table lunch_locations;
  end if;
end $$;

commit;

-- Post-check:
--   select tablename from pg_publication_tables where pubname = 'supabase_realtime';  -- includes lunch_locations
