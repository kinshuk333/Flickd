import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { inferCinematicLifeTags } from '../src/utils/cinematicLifeTags.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const readEnvFile = (fileName) => {
  const filePath = path.join(rootDir, fileName);
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(
    fs.readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=');
        const key = line.slice(0, index).trim();
        const value = line.slice(index + 1).trim().replace(/^["']|["']$/g, '');
        return [key, value];
      })
  );
};

const env = {
  ...readEnvFile('.env'),
  ...readEnvFile('.env.local'),
  ...process.env,
};

const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase env. Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const MIN_TAGS_PER_FILM = Number(env.MIN_THEME_TAGS_PER_FILM || 6);
const MAX_MOVIES_TO_RETAG = Number(env.MAX_MOVIES_TO_RETAG || 2000);

const runWithRetry = async (label, factory, retries = 3) => {
  let lastResult = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const result = await factory();
    lastResult = result;
    if (!result?.error) return result;
    if (attempt >= retries) return result;
    const delay = 450 * (attempt + 1) + Math.floor(Math.random() * 200);
    console.warn(`${label} failed (${result.error.message}); retrying in ${delay}ms...`);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  return lastResult;
};

const cleanTitleForKey = (title) => String(title || '')
  .trim()
  .replace(/\s*\(\d{4}(\d{4})?\)$/i, '')
  .replace(/\s*\([IVXLCDMivxlcdm]+\)$/i, '')
  .replace(/\s+/g, ' ')
  .toLowerCase();

const cacheKeyForMovie = (movie = {}) => {
  const imdbId = String(movie.imdbId || movie.imdbID || '').trim();
  if (imdbId) return `imdb:${imdbId}`;
  const title = cleanTitleForKey(movie.title);
  return title ? `title:${title}|${Number(movie.year) || ''}` : '';
};

const parseRuntime = (value) => {
  const numeric = Number(String(value || '').match(/\d+/)?.[0]);
  return Number.isFinite(numeric) ? numeric : 0;
};

const parseVotes = (value) => {
  const numeric = Number(String(value || '').replace(/,/g, '').replace(/[^\d]/g, ''));
  return Number.isFinite(numeric) ? numeric : 0;
};

const fromMovieCacheRow = (row = {}) => ({
  sourceTable: 'movie_cache',
  cacheKey: row.cache_key || '',
  imdbId: row.imdb_id || '',
  title: row.title || '',
  year: Number(row.year) || 0,
  titleType: row.title_type || 'movie',
  genres: row.genres || '',
  directors: row.directors || '',
  country: row.country || '',
  language: row.languages || '',
  runtime: Number(row.runtime) || 0,
  imdbRating: Number(row.imdb_rating) || 0,
  imdbVotes: Number(row.imdb_votes) || 0,
  numVotes: Number(row.imdb_votes) || 0,
  plot: row.description || '',
  description: row.description || '',
  omdbPlot: row.description || '',
});

const fromOmdbCacheRow = (row = {}) => {
  const data = row.data || {};
  const year = Number(String(data.Year || row.year || '').match(/\d{4}/)?.[0]) || 0;
  return {
    sourceTable: 'omdb_cache',
    cacheKey: row.cache_key || '',
    imdbId: data.imdbID || row.imdb_id || '',
    title: data.Title || row.title || '',
    year,
    titleType: data.Type || 'movie',
    genres: data.Genre && data.Genre !== 'N/A' ? data.Genre : '',
    directors: data.Director && data.Director !== 'N/A' ? data.Director : '',
    country: data.Country && data.Country !== 'N/A' ? data.Country : row.country || '',
    language: data.Language && data.Language !== 'N/A' ? data.Language : '',
    runtime: parseRuntime(data.Runtime),
    imdbRating: Number(data.imdbRating) || 0,
    imdbVotes: parseVotes(data.imdbVotes),
    numVotes: parseVotes(data.imdbVotes),
    plot: data.Plot && data.Plot !== 'N/A' ? data.Plot : '',
    description: data.Plot && data.Plot !== 'N/A' ? data.Plot : '',
    omdbPlot: data.Plot && data.Plot !== 'N/A' ? data.Plot : '',
  };
};

const fetchSourcePage = async ({ table, select, mapper, lastCacheKey = '', pageSize = 250 }) => {
  let query = supabase
    .from(table)
    .select(select)
    .order('cache_key', { ascending: true })
    .limit(pageSize);

  if (lastCacheKey) {
    query = query.gt('cache_key', lastCacheKey);
  }

  const { data, error } = await runWithRetry(`${table}:page`, () => query);

  if (error) {
    console.warn(`Stopping ${table}: ${error.message}`);
    return { rows: [], lastCacheKey, done: true };
  }

  const batch = Array.isArray(data) ? data : [];
  const rows = batch.map(mapper).filter((row) => row.title && (row.plot || row.description || row.genres));
  const nextLastCacheKey = batch.length ? String(batch[batch.length - 1]?.cache_key || lastCacheKey) : lastCacheKey;
  return { rows, lastCacheKey: nextLastCacheKey, done: batch.length < pageSize };
};

const fetchExistingTagCountsForPage = async (cacheKeys) => {
  const counts = new Map();
  if (!cacheKeys.length) return counts;

  for (let i = 0; i < cacheKeys.length; i += 75) {
    const chunk = cacheKeys.slice(i, i + 75);
    const { data, error } = await runWithRetry('movie_theme_tags:existing_page', () =>
      supabase
        .from('movie_theme_tags')
        .select('cache_key')
        .is('user_id', null)
        .in('cache_key', chunk)
    );

    if (error) {
      throw new Error(`Could not read existing tags for page: ${error.message}`);
    }
    (Array.isArray(data) ? data : []).forEach((row) => {
      if (row.cache_key) counts.set(row.cache_key, (counts.get(row.cache_key) || 0) + 1);
    });
  }
  return counts;
};

const fetchAll = async ({ table, select, mapper, pageSize = 1000 }) => {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await runWithRetry(`${table}:legacy_page`, () =>
      supabase
        .from(table)
        .select(select)
        .range(from, to)
    );

    if (error) {
      console.warn(`Skipping ${table}: ${error.message}`);
      return rows;
    }
    const batch = Array.isArray(data) ? data : [];
    rows.push(...batch.map(mapper).filter((row) => row.title && (row.plot || row.description || row.genres)));
    console.log(`Read ${rows.length} usable rows from ${table}...`);
    if (batch.length < pageSize) break;
  }
  return rows;
};

const fetchExistingTaggedKeys = async () => {
  const keys = new Set();
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await runWithRetry('movie_theme_tags:legacy_existing', () =>
      supabase
        .from('movie_theme_tags')
        .select('cache_key')
        .is('user_id', null)
        .range(from, from + pageSize - 1)
    );

    if (error) {
      throw new Error(`Could not read movie_theme_tags: ${error.message}`);
    }
    const batch = Array.isArray(data) ? data : [];
    batch.forEach((row) => {
      if (row.cache_key) keys.add(row.cache_key);
    });
    console.log(`Read ${keys.size} existing global tagged cache keys...`);
    if (batch.length < pageSize) break;
  }
  return keys;
};

const deleteGlobalTagsForKeys = async (cacheKeys) => {
  for (let i = 0; i < cacheKeys.length; i += 25) {
    const chunk = cacheKeys.slice(i, i + 25);
    const { error } = await runWithRetry('movie_theme_tags:delete_low_count', () =>
      supabase
        .from('movie_theme_tags')
        .delete()
        .is('user_id', null)
        .in('cache_key', chunk)
    );
    if (error) {
      throw new Error(`Delete failed: ${error.message}`);
    }
  }
};

const insertTagRecords = async (movies) => {
  const records = [];
  movies.forEach((movie) => {
    const tags = Array.isArray(movie.cinematicLifeTags) ? movie.cinematicLifeTags : inferCinematicLifeTags(movie);
    const cacheKey = movie.cacheKey || cacheKeyForMovie(movie);
    if (!cacheKey || tags.length === 0) return;
    tags.forEach((tag) => {
      records.push({
        user_id: null,
        movie_id: null,
        imdb_id: movie.imdbId || null,
        cache_key: cacheKey,
        title: movie.title || null,
        year: Number(movie.year) || null,
        tag: tag.tag,
        tag_type: tag.tag_type,
        importance: tag.importance,
        confidence: Number(tag.confidence) || 0.7,
        source: tag.source || 'rules',
        reason: tag.reason || null,
        tagger_version: tag.tagger_version || 'v1',
      });
    });
  });

  for (let i = 0; i < records.length; i += 500) {
    const chunk = records.slice(i, i + 500);
    const { error } = await runWithRetry('movie_theme_tags:insert', () =>
      supabase.from('movie_theme_tags').insert(chunk)
    );
    if (error) {
      throw new Error(`Insert failed: ${error.message}`);
    }
    console.log(`Inserted ${Math.min(i + chunk.length, records.length)} / ${records.length} tag rows...`);
  }
  return records.length;
};

const processSourceTable = async ({ table, select, mapper }) => {
  let lastCacheKey = '';
  let totalRows = 0;
  let totalMoviesTagged = 0;
  let totalTagsInserted = 0;

  for (;;) {
    if (totalMoviesTagged >= MAX_MOVIES_TO_RETAG) {
      console.log(`${table}: reached per-run cap of ${MAX_MOVIES_TO_RETAG} retagged films`);
      break;
    }
    const page = await fetchSourcePage({ table, select, mapper, lastCacheKey });
    lastCacheKey = page.lastCacheKey;
    if (!page.rows.length && page.done) break;

    const byCacheKey = new Map();
    page.rows.forEach((movie) => {
      const cacheKey = movie.cacheKey || cacheKeyForMovie(movie);
      if (!cacheKey) return;
      if (!byCacheKey.has(cacheKey)) byCacheKey.set(cacheKey, { ...movie, cacheKey });
    });

    const pageCacheKeys = Array.from(byCacheKey.keys());
    const existingCounts = await fetchExistingTagCountsForPage(pageCacheKeys);
    const moviesToTag = pageCacheKeys
      .map((cacheKey) => {
        const movie = byCacheKey.get(cacheKey);
        if (!movie) return null;
        const existingCount = existingCounts.get(cacheKey) || 0;
        if (existingCount >= MIN_TAGS_PER_FILM) return null;
        const nextTags = inferCinematicLifeTags(movie);
        if (nextTags.length <= existingCount) return null;
        return { ...movie, cinematicLifeTags: nextTags };
      })
      .filter(Boolean);
    const cappedMoviesToTag = moviesToTag.slice(0, Math.max(0, MAX_MOVIES_TO_RETAG - totalMoviesTagged));

    totalRows += page.rows.length;
    if (cappedMoviesToTag.length) {
      console.log(`${table}: retagging ${cappedMoviesToTag.length} low-count films from this page...`);
      await deleteGlobalTagsForKeys(cappedMoviesToTag.map((movie) => movie.cacheKey));
      const inserted = await insertTagRecords(cappedMoviesToTag);
      totalMoviesTagged += cappedMoviesToTag.length;
      totalTagsInserted += inserted;
    }

    console.log(`${table}: scanned ${totalRows}, tagged ${totalMoviesTagged}, inserted ${totalTagsInserted} tag rows`);
    if (page.done) break;
  }

  return { totalRows, totalMoviesTagged, totalTagsInserted };
};

const main = async () => {
  console.log('Backfilling movie theme tags from cached films...');

  const movieCacheResult = await processSourceTable({
      table: 'movie_cache',
      select: 'imdb_id,cache_key,title,year,title_type,runtime,imdb_rating,imdb_votes,genres,directors,country,languages,description',
      mapper: fromMovieCacheRow,
  });

  const omdbCacheResult = await processSourceTable({
      table: 'omdb_cache',
      select: 'cache_key,title,year,country,data',
      mapper: fromOmdbCacheRow,
  });

  const inserted = movieCacheResult.totalTagsInserted + omdbCacheResult.totalTagsInserted;
  console.log(`Backfill complete. Inserted ${inserted} movie theme tag rows.`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
