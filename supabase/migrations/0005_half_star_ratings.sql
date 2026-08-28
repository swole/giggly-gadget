-- 0005_half_star_ratings.sql - ratings move to half-star steps (1-5 by 0.5).
-- Notion stores them as select options ⭐ … ⭐⭐⭐⭐½ … ⭐⭐⭐⭐⭐ (lib/rating.ts converts).
-- Applied 2026-08-28 via the platform pg-meta query API.

alter table recipes alter column rating type numeric(3,1) using rating::numeric(3,1);

-- Post-check:
--   select data_type, numeric_scale from information_schema.columns
--   where table_name='recipes' and column_name='rating';   -- numeric, scale 1
