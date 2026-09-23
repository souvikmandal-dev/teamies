-- Migration 006: Add instagram_url to public.profiles
alter table public.profiles
add column if not exists instagram_url text;

