insert into public.omdb_cache (
  cache_key,
  imdb_id,
  title,
  year,
  poster,
  country,
  data,
  updated_at
)
select distinct on (
  'title:' ||
  lower(
    regexp_replace(
      regexp_replace(
        regexp_replace(coalesce(title, data->>'Title', ''), '\s*\(\d{4}(\d{4})?\)$', '', 'i'),
        '\s*\[[^\]]*\]$', '', 'g'
      ),
      '\s+', ' ', 'g'
    )
  ) ||
  '|' ||
  coalesce(year, nullif(substring(coalesce(data->>'Year', '') from '\d{4}'), '')::integer)::text
)
  'title:' ||
  lower(
    regexp_replace(
      regexp_replace(
        regexp_replace(coalesce(title, data->>'Title', ''), '\s*\(\d{4}(\d{4})?\)$', '', 'i'),
        '\s*\[[^\]]*\]$', '', 'g'
      ),
      '\s+', ' ', 'g'
    )
  ) ||
  '|' ||
  coalesce(year, nullif(substring(coalesce(data->>'Year', '') from '\d{4}'), '')::integer)::text as cache_key,
  coalesce(imdb_id, data->>'imdbID', data->>'imdbId') as imdb_id,
  coalesce(title, data->>'Title') as title,
  coalesce(year, nullif(substring(coalesce(data->>'Year', '') from '\d{4}'), '')::integer) as year,
  coalesce(poster, nullif(data->>'Poster', 'N/A')) as poster,
  coalesce(country, nullif(data->>'Country', 'N/A')) as country,
  data,
  now() as updated_at
from public.omdb_cache
where coalesce(title, data->>'Title', '') <> ''
  and coalesce(year, nullif(substring(coalesce(data->>'Year', '') from '\d{4}'), '')::integer) is not null
  and data is not null
on conflict (cache_key) do update set
  imdb_id = coalesce(excluded.imdb_id, public.omdb_cache.imdb_id),
  title = coalesce(excluded.title, public.omdb_cache.title),
  year = coalesce(excluded.year, public.omdb_cache.year),
  poster = coalesce(excluded.poster, public.omdb_cache.poster),
  country = coalesce(excluded.country, public.omdb_cache.country),
  data = coalesce(excluded.data, public.omdb_cache.data),
  updated_at = now();
