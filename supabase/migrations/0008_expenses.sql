-- 0008: expenses + expense_items + receipt_reads. What the week's shop cost, logged where the
-- trip ends: a money chip on the Wet market and Supermarket sections of /grocery.
-- Wet market = Shallaine's cash, which Johnny pays back; supermarket = the UOB supplementary
-- card (or cash until the card arrives). Receipt photos are read by Claude and thrown away;
-- only the numbers land here. Every write goes through /api/spend/* with the service role, so
-- the browser (anon key) gets SELECT for Realtime and nothing else.
-- week_of is the grocery week the shop was FOR (Saturday's trip stocks the coming week);
-- spent_on is the receipt date.
-- Apply by hand in the Supabase SQL editor (same as 0003-0007). Safe to re-run.
begin;

create table if not exists expenses (
  id bigserial primary key,
  week_of date not null check (extract(isodow from week_of) = 1),
  shop text not null check (shop in ('wet_market', 'supermarket', 'other')),
  merchant text check (merchant is null or length(merchant) <= 80),
  total_sgd numeric(8,2) not null check (total_sgd > 0),
  paid_with text not null check (paid_with in ('cash', 'card')),
  reimbursable boolean not null default false,
  reimbursed_at timestamptz,
  reimbursed_by text,
  spent_on date not null,
  added_by text,
  note text check (note is null or length(note) <= 240),
  receipt_read boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expenses_reimbursed_pair check ((reimbursed_at is null) = (reimbursed_by is null)),
  constraint expenses_reimbursed_needs_reimbursable check (reimbursed_at is null or reimbursable)
);

create index if not exists expenses_week_shop_idx on expenses (week_of, shop);
create index if not exists expenses_spent_on_idx on expenses (spent_on);
create index if not exists expenses_owed_idx on expenses (spent_on) where reimbursable and reimbursed_at is null;

create table if not exists expense_items (
  id bigserial primary key,
  expense_id bigint not null references expenses (id) on delete cascade,
  position int not null default 0,
  name text not null,
  raw text,
  qty text,
  amount_sgd numeric(8,2) not null,
  grocery_list_id bigint references grocery_list (id) on delete set null,
  kind text not null default 'item' check (kind in ('item', 'discount', 'fee'))
);

create index if not exists expense_items_expense_idx on expense_items (expense_id, position);

-- One row per Claude receipt read, so /api/spend/read-receipt can cap reads (12 per 24 h)
-- across serverless instances. Service role only: no anon policy.
create table if not exists receipt_reads (
  id bigserial primary key,
  read_at timestamptz not null default now(),
  read_by text,
  ok boolean not null default true
);

create index if not exists receipt_reads_at_idx on receipt_reads (read_at);

alter table expenses enable row level security;
alter table expense_items enable row level security;
alter table receipt_reads enable row level security;
drop policy if exists "anon read" on expenses;
create policy "anon read" on expenses for select using (true);
drop policy if exists "anon read" on expense_items;
create policy "anon read" on expense_items for select using (true);

-- Realtime: publish expenses only (the client refetches the week, items included, on any
-- event); full replica identity so DELETE events carry week_of for the channel filter.
alter table expenses replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'expenses'
  ) then
    alter publication supabase_realtime add table expenses;
  end if;
end $$;

commit;

-- Post-check:
--   select tablename from pg_publication_tables where pubname = 'supabase_realtime';  -- includes expenses
--   select policyname, cmd from pg_policies where tablename in ('expenses', 'expense_items');  -- "anon read" / SELECT
--   select count(*) from expenses;  -- 0 on first apply
