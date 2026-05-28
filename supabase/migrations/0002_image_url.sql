-- Add image_url to recipes for stock food photography (TheMealDB + Pexels fallback).
alter table recipes add column if not exists image_url text;
