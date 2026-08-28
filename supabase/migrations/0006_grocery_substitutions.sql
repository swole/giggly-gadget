-- 0006_grocery_substitutions.sql - "can't find it" swaps on the shopping list.
-- A swapped row keeps the original item name in substituted_for so the rebuild
-- reconciler treats it as the same row (lib/grocery/reconcile.ts).
-- Applied 2026-08-29 via the platform pg-meta query API.

alter table grocery_list add column if not exists substituted_for text;

-- Post-check:
--   select column_name from information_schema.columns
--   where table_name='grocery_list' and column_name='substituted_for';
