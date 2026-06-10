create table if not exists public.movie_theme_tag_sets (
  id uuid primary key default gen_random_uuid(),
  movie_id uuid null,
  imdb_id text null,
  cache_key text null,
  title text null,
  year integer null,
  user_id uuid null,
  tagger_version text default 'v2',
  tags jsonb not null default '[]'::jsonb,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create index if not exists movie_theme_tag_sets_user_id_idx
  on public.movie_theme_tag_sets(user_id);

create index if not exists movie_theme_tag_sets_imdb_id_idx
  on public.movie_theme_tag_sets(imdb_id);

create index if not exists movie_theme_tag_sets_cache_key_idx
  on public.movie_theme_tag_sets(cache_key);

create index if not exists movie_theme_tag_sets_tags_gin_idx
  on public.movie_theme_tag_sets using gin (tags);

create unique index if not exists movie_theme_tag_sets_global_imdb_unique_idx
  on public.movie_theme_tag_sets(imdb_id, tagger_version)
  where user_id is null and imdb_id is not null;

create unique index if not exists movie_theme_tag_sets_global_cache_unique_idx
  on public.movie_theme_tag_sets(cache_key, tagger_version)
  where user_id is null and imdb_id is null and cache_key is not null;

create unique index if not exists movie_theme_tag_sets_user_imdb_unique_idx
  on public.movie_theme_tag_sets(user_id, imdb_id, tagger_version)
  where user_id is not null and imdb_id is not null;

create unique index if not exists movie_theme_tag_sets_user_cache_unique_idx
  on public.movie_theme_tag_sets(user_id, cache_key, tagger_version)
  where user_id is not null and imdb_id is null and cache_key is not null;

-- Backfill global film tags from cached metadata with:
--   npm.cmd run backfill:theme-tag-sets
-- The script reads movie_cache and omdb_cache, generates rule-based tags,
-- and inserts one shared row per film with user_id = null.
