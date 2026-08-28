-- 0003_meal_planning.sql — meal planner, grocery-from-plan, roles.
-- Idempotent. Run in the Supabase SQL editor (migrations are applied by hand in this project).
-- Pre-check (optional): select column_name from information_schema.columns where table_name = 'recipes';

begin;

-- 0. Heal known drift: prod has recipes.source (written by lib/notion-sync.ts) but no migration created it.
alter table recipes add column if not exists source text;

-- 1. planned_meals: slot, eaters, ordering, note, cooked state, leftovers link, derived week.
alter table planned_meals
  add column if not exists slot        text not null default 'dinner',
  add column if not exists eaters      text not null default 'both',
  add column if not exists position    int  not null default 0,
  add column if not exists note        text,
  add column if not exists cooked_at   timestamptz,
  add column if not exists cooked_by   text,
  add column if not exists leftover_of bigint references planned_meals(id) on delete set null,
  add column if not exists week_of     date generated always as
    (planned_for - (extract(isodow from planned_for)::int - 1)) stored;   -- Monday of planned_for

alter table planned_meals drop constraint if exists planned_meals_slot_check;
alter table planned_meals add constraint planned_meals_slot_check
  check (slot in ('breakfast', 'lunch', 'dinner', 'snack'));
alter table planned_meals drop constraint if exists planned_meals_eaters_check;
alter table planned_meals add constraint planned_meals_eaters_check
  check (eaters in ('both', 'johnny', 'lydia'));

create unique index if not exists planned_meals_day_slot_recipe_uq
  on planned_meals (planned_for, slot, recipe_id);
create index if not exists planned_meals_week_idx     on planned_meals (week_of);
create index if not exists planned_meals_day_slot_idx on planned_meals (planned_for, slot, position);

-- 2. grocery_list: provenance, shop, staple flag, who added.
--    source defaults to 'manual' so existing rows are never treated as planner-owned.
alter table grocery_list
  add column if not exists source   text    not null default 'manual',
  add column if not exists shop     text,
  add column if not exists staple   boolean not null default false,
  add column if not exists added_by text;
alter table grocery_list drop constraint if exists grocery_list_source_check;
alter table grocery_list add constraint grocery_list_source_check
  check (source in ('plan', 'manual'));
alter table grocery_list drop constraint if exists grocery_list_shop_check;
alter table grocery_list add constraint grocery_list_shop_check
  check (shop is null or shop in ('wet_market', 'supermarket', 'either'));
create index if not exists grocery_list_week_source_idx on grocery_list (week_of, source);

-- 3. pantry_staples: things that live in the cupboard and should not be re-bought weekly.
--    Names are normalized lower-case. Seeded from the kitchen manual's "Pantry, buy once" list.
create table if not exists pantry_staples (
  name     text primary key,
  added_by text,
  added_at timestamptz not null default now()
);
alter table pantry_staples enable row level security;
drop policy if exists "anon all" on pantry_staples;
create policy "anon all" on pantry_staples for all using (true) with check (true);

insert into pantry_staples (name, added_by) values
  -- oils, vinegars, wines
  ('olive oil','seed'),('extra virgin olive oil','seed'),('canola oil','seed'),('vegetable oil','seed'),('neutral oil','seed'),
  ('sesame oil','seed'),('rice vinegar','seed'),('black vinegar','seed'),('red wine vinegar','seed'),('white vinegar','seed'),
  ('vinegar','seed'),('mirin','seed'),('shaoxing wine','seed'),('tamarind pulp','seed'),
  -- sauces and pastes (measured, not re-bought weekly)
  ('light soy','seed'),('light soy sauce','seed'),('dark soy','seed'),('dark soy sauce','seed'),('soy sauce','seed'),
  ('fish sauce','seed'),('white miso','seed'),('miso','seed'),('doubanjiang','seed'),('gochujang','seed'),('gochugaru','seed'),
  ('ponzu','seed'),('belacan','seed'),('sesame paste','seed'),('chinese sesame paste','seed'),('black sesame paste','seed'),
  ('natural peanut butter','seed'),('peanut butter','seed'),('tomato paste','seed'),('harissa','seed'),('chilli oil','seed'),
  -- grains, pulses, noodles, flours
  ('brown rice','seed'),('rice','seed'),('jasmine rice','seed'),('glutinous rice','seed'),('millet','seed'),('pearl barley','seed'),
  ('quinoa','seed'),('freekeh','seed'),('rolled oats','seed'),('oats','seed'),('wholewheat pasta','seed'),('soba','seed'),
  ('wholewheat noodles','seed'),('buckwheat noodles','seed'),('rice vermicelli','seed'),('wonton skins','seed'),
  ('red lentils','seed'),('brown lentils','seed'),('chickpeas','seed'),('black beans','seed'),('red kidney beans','seed'),
  ('cannellini beans','seed'),('dried soybean','seed'),('chickpea flour','seed'),('cornflour','seed'),('flour','seed'),
  -- seeds, nuts, dried goods
  ('chia seeds','seed'),('hemp seeds','seed'),('walnuts','seed'),('peanuts','seed'),('roasted cashew','seed'),('cashews','seed'),
  ('pumpkin seeds','seed'),('sesame seed','seed'),('sesame seeds','seed'),('dried shiitake','seed'),('dried black fungus','seed'),
  ('kombu','seed'),('dried wakame','seed'),('wakame','seed'),('nori','seed'),('dried hijiki','seed'),('hijiki','seed'),
  ('dried chilli','seed'),('dried chilli flakes','seed'),('chilli flakes','seed'),
  -- spices
  ('salt','seed'),('black pepper','seed'),('white pepper','seed'),('sichuan peppercorn','seed'),('cumin','seed'),('cumin seed','seed'),
  ('coriander seed','seed'),('coriander powder','seed'),('turmeric','seed'),('paprika','seed'),('smoked paprika','seed'),
  ('garam masala','seed'),('chilli powder','seed'),('amchur','seed'),('mustard seed','seed'),('fenugreek','seed'),
  ('cinnamon','seed'),('cinnamon stick','seed'),('star anise','seed'),('bay leaf','seed'),('dried oregano','seed'),('sumac','seed'),
  ('shichimi','seed'),('five-spice','seed'),('cocoa powder','seed'),('date syrup','seed'),('honey','seed'),('sugar','seed'),
  -- other
  ('nuttelex','seed'),('unsweetened soy milk','seed'),('soy milk','seed'),('water','seed')
on conflict (name) do nothing;

-- 4. Realtime: publish planned_meals; full replica identity so filtered DELETE events carry the row.
alter table planned_meals replica identity full;
alter table grocery_list  replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'planned_meals'
  ) then
    alter publication supabase_realtime add table planned_meals;
  end if;
end $$;

commit;

-- Post-check:
--   select relname, relreplident from pg_class where relname in ('planned_meals','grocery_list');  -- both 'f'
--   select tablename from pg_publication_tables where pubname = 'supabase_realtime';              -- includes planned_meals
