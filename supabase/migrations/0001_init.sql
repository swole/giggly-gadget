-- Giggly Gadget — initial schema
-- App is public, no auth. RLS enabled with open policies so anon key can read/write.

create extension if not exists "pgcrypto";

-- ---------- recipes (mirror of Notion .Recipes) ----------
create table recipes (
  id uuid primary key,                       -- Notion page id
  title text not null,
  cuisine text,
  meal_type text,
  difficulty text,
  prep_min int,
  cook_min int,
  servings int,
  rating int,
  tags text[] not null default '{}',
  source_url text,
  notes text,
  last_made date,
  want_to_try boolean not null default false,
  instructions_md text,                       -- raw markdown body
  notion_updated_at timestamptz,
  synced_at timestamptz not null default now()
);

create index recipes_cuisine_idx on recipes (cuisine);
create index recipes_meal_type_idx on recipes (meal_type);
create index recipes_tags_idx on recipes using gin (tags);
create index recipes_want_to_try_idx on recipes (want_to_try) where want_to_try = true;
create index recipes_last_made_idx on recipes (last_made);

-- ---------- ingredients_parsed (one row per ingredient line) ----------
create table ingredients_parsed (
  id bigserial primary key,
  recipe_id uuid not null references recipes(id) on delete cascade,
  line_index int not null,
  raw text not null,                          -- original line, always preserved
  qty_min numeric,
  qty_max numeric,
  unit text,                                  -- canonical: g, ml, tbsp, tsp, cup, clove, piece, can, ...
  name text,
  modifier text,                              -- "minced", "boneless"
  optional boolean not null default false,
  to_taste boolean not null default false,
  scalable boolean not null default true,
  category text,                              -- produce | dairy | pantry | protein | spice | other
  unique (recipe_id, line_index)
);

create index ingredients_parsed_recipe_idx on ingredients_parsed (recipe_id);
create index ingredients_parsed_name_idx on ingredients_parsed (name);

-- View: parse failures, for the V1.1 inbox
create view parse_issues as
  select recipe_id, line_index, raw,
         case
           when not scalable and not to_taste then 'qty/unit unparseable'
           when name is null then 'no name extracted'
           else 'other'
         end as reason
  from ingredients_parsed
  where (not scalable and not to_taste) or name is null;

-- ---------- cook_log ----------
create table cook_log (
  id bigserial primary key,
  recipe_id uuid not null references recipes(id) on delete cascade,
  cooked_by text,                             -- free text: 'Johnny' | 'Lydia' | null
  cooked_at timestamptz not null default now(),
  servings int,
  rating int,
  notes text
);

create index cook_log_recipe_idx on cook_log (recipe_id);
create index cook_log_cooked_at_idx on cook_log (cooked_at desc);

-- ---------- planned_meals (V1.1 — table created now, used later) ----------
create table planned_meals (
  id bigserial primary key,
  recipe_id uuid not null references recipes(id) on delete cascade,
  planned_for date not null,
  planned_servings int,
  added_by text,
  added_at timestamptz not null default now()
);

create index planned_meals_planned_for_idx on planned_meals (planned_for);

-- ---------- grocery_list ----------
create table grocery_list (
  id bigserial primary key,
  week_of date not null,                      -- Monday of the week
  name text not null,
  qty_min numeric,
  qty_max numeric,
  unit text,
  category text,
  recipe_ids uuid[] not null default '{}',
  checked boolean not null default false,
  checked_by text,
  checked_at timestamptz,
  unique (week_of, name, unit)
);

create index grocery_list_week_idx on grocery_list (week_of);
create index grocery_list_checked_idx on grocery_list (week_of, checked);

-- ---------- RLS: open policies (app is public, URL is the credential) ----------
alter table recipes enable row level security;
alter table ingredients_parsed enable row level security;
alter table cook_log enable row level security;
alter table planned_meals enable row level security;
alter table grocery_list enable row level security;

create policy "anon all" on recipes            for all using (true) with check (true);
create policy "anon all" on ingredients_parsed for all using (true) with check (true);
create policy "anon all" on cook_log           for all using (true) with check (true);
create policy "anon all" on planned_meals      for all using (true) with check (true);
create policy "anon all" on grocery_list       for all using (true) with check (true);

-- ---------- Realtime: publish grocery_list and cook_log for live sync ----------
alter publication supabase_realtime add table grocery_list;
alter publication supabase_realtime add table cook_log;
