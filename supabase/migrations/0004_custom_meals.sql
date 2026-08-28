-- 0004_custom_meals.sql - one-off plan items ("white rice", "extra toast") that are
-- not recipes. A planned_meals row now carries EITHER a recipe_id OR custom_text.
-- Idempotent. Run in the Supabase SQL editor (migrations are applied by hand in this project).

begin;

alter table planned_meals alter column recipe_id drop not null;
alter table planned_meals add column if not exists custom_text text;

alter table planned_meals drop constraint if exists planned_meals_recipe_or_text;
alter table planned_meals add constraint planned_meals_recipe_or_text
  check ((recipe_id is null) <> (custom_text is null));

-- Custom rows are never leftovers of anything and nothing can be a leftover of them
-- (enforced in the API; no DB change needed - leftover_of already references rows, not recipes).

commit;

-- Post-check:
--   select is_nullable from information_schema.columns where table_name='planned_meals' and column_name='recipe_id';  -- YES
--   select count(*) from planned_meals where recipe_id is null and custom_text is null;                              -- 0
