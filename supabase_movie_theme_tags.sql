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
    'emotional_moral_theme'
  )),
  importance text not null check (importance in (
    'primary',
    'secondary',
    'fallback'
  )),
  confidence numeric default 0.7,
  source text default 'rules',
  reason text null,
  tagger_version text default 'v1',
  created_at timestamp with time zone default now(),

  constraint movie_theme_tags_identity_key
    unique (user_id, imdb_id, cache_key, title, year, tag, tagger_version)
);

create index if not exists movie_theme_tags_user_id_idx
  on public.movie_theme_tags(user_id);

create index if not exists movie_theme_tags_imdb_id_idx
  on public.movie_theme_tags(imdb_id);

create index if not exists movie_theme_tags_cache_key_idx
  on public.movie_theme_tags(cache_key);

create index if not exists movie_theme_tags_tag_idx
  on public.movie_theme_tags(tag);

create index if not exists movie_theme_tags_tag_type_idx
  on public.movie_theme_tags(tag_type);
