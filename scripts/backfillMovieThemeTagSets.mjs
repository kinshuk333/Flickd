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
        return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^["']|["']$/g, '')];
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

const PAGE_SIZE = Number(env.TAG_SET_SOURCE_PAGE_SIZE || 250);
const INSERT_CHUNK_SIZE = Number(env.TAG_SET_INSERT_CHUNK_SIZE || 10);
const DELETE_CHUNK_SIZE = Number(env.TAG_SET_DELETE_CHUNK_SIZE || 200);
const TAGGER_VERSION = 'v2';
const CLEAR_EXISTING_TAG_SETS = env.CLEAR_EXISTING_TAG_SETS === '1';
const START_AFTER_CACHE_KEY = env.START_AFTER_CACHE_KEY || '';
const importanceRank = { primary: 3, secondary: 2, fallback: 1 };

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

const dedupeTags = (tags = []) => {
  const byKey = new Map();
  tags.forEach((tag) => {
    if (!tag?.tag || !tag?.tag_type) return;
    const key = `${tag.tag_type}:${tag.tag}:${tag.tagger_version || TAGGER_VERSION}`;
    const existing = byKey.get(key);
    const score = (importanceRank[tag.importance] || 0) * 10 + (Number(tag.confidence) || 0);
    const existingScore = existing ? (importanceRank[existing.importance] || 0) * 10 + (Number(existing.confidence) || 0) : -1;
    if (!existing || score > existingScore) byKey.set(key, tag);
  });
  return Array.from(byKey.values()).sort((a, b) =>
    String(a.tag_type).localeCompare(String(b.tag_type)) ||
    String(a.tag).localeCompare(String(b.tag))
  );
};

const movieToRecord = (movie = {}) => {
  const tags = dedupeTags(inferCinematicLifeTags(movie));
  const cacheKey = movie.cacheKey || cacheKeyForMovie(movie);
  if (!cacheKey || !movie.title || !tags.length) return null;
  return {
    user_id: null,
    movie_id: null,
    imdb_id: movie.imdbId || null,
    cache_key: cacheKey,
    title: movie.title || null,
    year: Number(movie.year) || null,
    tagger_version: TAGGER_VERSION,
    tags,
    updated_at: new Date().toISOString(),
  };
};

const deleteExistingSets = async (records = []) => {
  const imdbIds = [...new Set(records.map((record) => record.imdb_id).filter(Boolean))];
  for (let i = 0; i < imdbIds.length; i += DELETE_CHUNK_SIZE) {
    const chunk = imdbIds.slice(i, i + DELETE_CHUNK_SIZE);
    const { error } = await runWithRetry('movie_theme_tag_sets:delete_imdb', () =>
      supabase
        .from('movie_theme_tag_sets')
        .delete()
        .is('user_id', null)
        .in('imdb_id', chunk)
    );
    if (error) throw new Error(`Delete existing IMDb sets failed: ${error.message}`);
  }

  const cacheKeys = [...new Set(records.filter((record) => !record.imdb_id && record.cache_key).map((record) => record.cache_key))];
  for (let i = 0; i < cacheKeys.length; i += DELETE_CHUNK_SIZE) {
    const chunk = cacheKeys.slice(i, i + DELETE_CHUNK_SIZE);
    const { error } = await runWithRetry('movie_theme_tag_sets:delete_cache', () =>
      supabase
        .from('movie_theme_tag_sets')
        .delete()
        .is('user_id', null)
        .in('cache_key', chunk)
    );
    if (error) throw new Error(`Delete existing cache-key sets failed: ${error.message}`);
  }
};

const fetchExistingSetKeys = async (records = []) => {
  const existing = new Set();
  const imdbIds = [...new Set(records.map((record) => record.imdb_id).filter(Boolean))];
  for (let i = 0; i < imdbIds.length; i += INSERT_CHUNK_SIZE) {
    const chunk = imdbIds.slice(i, i + INSERT_CHUNK_SIZE);
    const { data, error } = await runWithRetry('movie_theme_tag_sets:existing_imdb', () =>
      supabase
        .from('movie_theme_tag_sets')
        .select('imdb_id,tagger_version')
        .is('user_id', null)
        .in('imdb_id', chunk)
    );
    if (error) throw new Error(`Read existing IMDb sets failed: ${error.message}`);
    (Array.isArray(data) ? data : []).forEach((row) => {
      if (row.imdb_id) existing.add(`imdb:${row.imdb_id}|${row.tagger_version || TAGGER_VERSION}`);
    });
  }

  const cacheKeys = [...new Set(records.filter((record) => !record.imdb_id && record.cache_key).map((record) => record.cache_key))];
  for (let i = 0; i < cacheKeys.length; i += INSERT_CHUNK_SIZE) {
    const chunk = cacheKeys.slice(i, i + INSERT_CHUNK_SIZE);
    const { data, error } = await runWithRetry('movie_theme_tag_sets:existing_cache', () =>
      supabase
        .from('movie_theme_tag_sets')
        .select('cache_key,tagger_version')
        .is('user_id', null)
        .in('cache_key', chunk)
    );
    if (error) throw new Error(`Read existing cache-key sets failed: ${error.message}`);
    (Array.isArray(data) ? data : []).forEach((row) => {
      if (row.cache_key) existing.add(`cache:${row.cache_key}|${row.tagger_version || TAGGER_VERSION}`);
    });
  }
  return existing;
};

const insertSetRecords = async (records = []) => {
  for (let i = 0; i < records.length; i += INSERT_CHUNK_SIZE) {
    const chunk = records.slice(i, i + INSERT_CHUNK_SIZE);
    const { error } = await runWithRetry('movie_theme_tag_sets:insert', () =>
      supabase
        .from('movie_theme_tag_sets')
        .insert(chunk)
    );
    if (error) throw new Error(`Insert tag sets failed: ${error.message}`);
  }
};

const clearExistingGlobalSets = async () => {
  let deleted = 0;
  for (;;) {
    const { data, error } = await runWithRetry('movie_theme_tag_sets:list_existing', () =>
      supabase
        .from('movie_theme_tag_sets')
        .select('id')
        .is('user_id', null)
        .limit(DELETE_CHUNK_SIZE)
    );
    if (error) throw new Error(`Read existing compact rows failed: ${error.message}`);
    const ids = (Array.isArray(data) ? data : []).map((row) => row.id).filter(Boolean);
    if (!ids.length) break;
    const { error: deleteError } = await runWithRetry('movie_theme_tag_sets:clear_existing', () =>
      supabase.from('movie_theme_tag_sets').delete().in('id', ids)
    );
    if (deleteError) throw new Error(`Clear existing compact rows failed: ${deleteError.message}`);
    deleted += ids.length;
    console.log(`Deleted ${deleted} existing compact rows...`);
  }
};

const fetchSourcePage = async ({ table, select, mapper, lastCacheKey = '' }) => {
  let query = supabase
    .from(table)
    .select(select)
    .order('cache_key', { ascending: true })
    .limit(PAGE_SIZE);
  if (lastCacheKey) query = query.gt('cache_key', lastCacheKey);
  const { data, error } = await runWithRetry(`${table}:page`, () => query);
  if (error) throw new Error(`${table} read failed: ${error.message}`);
  const batch = Array.isArray(data) ? data : [];
  const rows = batch
    .map(mapper)
    .filter((row) => row.title && (row.plot || row.description || row.genres));
  return {
    rows,
    lastCacheKey: batch.length ? String(batch[batch.length - 1]?.cache_key || lastCacheKey) : lastCacheKey,
    done: batch.length < PAGE_SIZE,
  };
};

const processSourceTable = async ({ table, select, mapper }) => {
  let lastCacheKey = table === 'movie_cache' ? START_AFTER_CACHE_KEY : '';
  let scanned = 0;
  let written = 0;

  for (;;) {
    const page = await fetchSourcePage({ table, select, mapper, lastCacheKey });
    lastCacheKey = page.lastCacheKey;

    const recordsByKey = new Map();
    page.rows.forEach((movie) => {
      const record = movieToRecord(movie);
      if (!record) return;
      const key = record.imdb_id ? `imdb:${record.imdb_id}` : `cache:${record.cache_key}`;
      recordsByKey.set(key, record);
    });
    const records = Array.from(recordsByKey.values());
    const existingSetKeys = await fetchExistingSetKeys(records);
    const missingRecords = records.filter((record) => {
      const key = record.imdb_id
        ? `imdb:${record.imdb_id}|${record.tagger_version}`
        : `cache:${record.cache_key}|${record.tagger_version}`;
      return !existingSetKeys.has(key);
    });

    if (missingRecords.length) {
      await deleteExistingSets(missingRecords);
      await insertSetRecords(missingRecords);
      written += missingRecords.length;
    }

    scanned += page.rows.length;
    console.log(`${table}: scanned ${scanned}, wrote ${written} compact rows`);
    if (page.done) break;
  }

  return { scanned, written };
};

console.log('Rebuilding compact movie theme tag sets from cached film metadata...');
if (CLEAR_EXISTING_TAG_SETS) {
  await clearExistingGlobalSets();
}

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

console.log(`Tag-set rebuild complete. Wrote ${movieCacheResult.written + omdbCacheResult.written} compact rows.`);
