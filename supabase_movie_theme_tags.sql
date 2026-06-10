create table if not exists public.movie_theme_tags (
  id uuid primary key default gen_random_uuid(),

  movie_id uuid null,
  imdb_id text null,
  cache_key text null,
  title text null,
  year integer null,

  user_id uuid null,
  tag text not null,
  tag_type text not null check (tag_type in (
    'setting',
    'life_stage',
    'social_world',
    'social_context',
    'story_situation',
    'tone_texture',
    'emotional_moral_theme',
    'plot_keyword'
  )),
  importance text not null check (importance in (
    'primary',
    'secondary',
    'fallback'
  )),
  confidence numeric default 0.7,
  source text default 'rules',
  reason text null,
  tagger_version text default 'v2',
  created_at timestamp with time zone default now(),

  constraint movie_theme_tags_identity_key
    unique (user_id, imdb_id, cache_key, title, year, tag, tagger_version)
);

alter table public.movie_theme_tags
  drop constraint if exists movie_theme_tags_tag_type_check;

alter table public.movie_theme_tags
  add constraint movie_theme_tags_tag_type_check
  check (tag_type in (
    'setting',
    'life_stage',
    'social_world',
    'social_context',
    'story_situation',
    'tone_texture',
    'emotional_moral_theme',
    'plot_keyword'
  ));

with ranked_movie_theme_tags as (
  select
    id,
    row_number() over (
      partition by
        coalesce(user_id::text, 'global'),
        case
          when imdb_id is not null then 'imdb:' || imdb_id
          when cache_key is not null then 'cache:' || cache_key
          else 'title:' || coalesce(lower(title), '') || '|' || coalesce(year::text, '')
        end,
        tag_type,
        tag,
        coalesce(tagger_version, 'v1')
      order by
        case importance
          when 'primary' then 3
          when 'secondary' then 2
          when 'fallback' then 1
          else 0
        end desc,
        confidence desc nulls last,
        created_at asc nulls last,
        id asc
    ) as duplicate_rank
  from public.movie_theme_tags
)
delete from public.movie_theme_tags as tags
using ranked_movie_theme_tags as ranked
where tags.id = ranked.id
  and ranked.duplicate_rank > 1;

create index if not exists movie_theme_tags_user_id_idx
  on public.movie_theme_tags(user_id);

create index if not exists movie_theme_tags_imdb_id_idx
  on public.movie_theme_tags(imdb_id);

create index if not exists movie_theme_tags_cache_key_idx
  on public.movie_theme_tags(cache_key);

create index if not exists movie_theme_tags_user_cache_key_idx
  on public.movie_theme_tags(user_id, cache_key);

create index if not exists movie_theme_tags_tag_idx
  on public.movie_theme_tags(tag);

create index if not exists movie_theme_tags_tag_type_idx
  on public.movie_theme_tags(tag_type);

create unique index if not exists movie_theme_tags_global_imdb_tag_unique_idx
  on public.movie_theme_tags(imdb_id, tag_type, tag, tagger_version)
  where user_id is null and imdb_id is not null;

create unique index if not exists movie_theme_tags_global_cache_tag_unique_idx
  on public.movie_theme_tags(cache_key, tag_type, tag, tagger_version)
  where user_id is null and imdb_id is null and cache_key is not null;

create unique index if not exists movie_theme_tags_user_imdb_tag_unique_idx
  on public.movie_theme_tags(user_id, imdb_id, tag_type, tag, tagger_version)
  where user_id is not null and imdb_id is not null;

create unique index if not exists movie_theme_tags_user_cache_tag_unique_idx
  on public.movie_theme_tags(user_id, cache_key, tag_type, tag, tagger_version)
  where user_id is not null and imdb_id is null and cache_key is not null;

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
--   npm.cmd run backfill:theme-tags
-- The script reads movie_cache and omdb_cache, generates rule-based tags,
-- and inserts shared rows with user_id = null.
