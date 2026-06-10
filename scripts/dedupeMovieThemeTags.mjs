import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

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

const DRY_RUN = env.DRY_RUN === '1';
const PAGE_SIZE = Number(env.DEDUPE_PAGE_SIZE || 1000);
const DELETE_CHUNK_SIZE = Number(env.DEDUPE_DELETE_CHUNK_SIZE || 200);
const MAX_GROUPS_TO_CLEAN = Number(env.MAX_DEDUPE_GROUPS || 5000);
const importanceRank = { primary: 3, secondary: 2, fallback: 1 };

const rowScore = (row = {}) => (
  (importanceRank[row.importance] || 0) * 100 +
  (Number(row.confidence) || 0) * 10 +
  (row.source === 'plot_keyword' ? 1 : 0)
);

const dedupeKey = (row = {}) => {
  const scope = row.user_id || 'global';
  const filmKey = row.imdb_id
    ? `imdb:${row.imdb_id}`
    : row.cache_key
      ? `cache:${row.cache_key}`
      : `title:${String(row.title || '').trim().toLowerCase()}|${Number(row.year) || ''}`;
  return `${scope}|${filmKey}|${row.tag_type}|${row.tag}|${row.tagger_version || 'v1'}`;
};

const deleteRows = async (ids = []) => {
  for (let i = 0; i < ids.length; i += DELETE_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + DELETE_CHUNK_SIZE);
    const { error } = await supabase
      .from('movie_theme_tags')
      .delete()
      .in('id', chunk);
    if (error) throw new Error(`Delete failed: ${error.message}`);
    console.log(`Deleted ${Math.min(i + chunk.length, ids.length)} / ${ids.length} duplicate rows...`);
  }
};

const groupRows = new Map();
let lastKey = '';
let scanned = 0;

for (;;) {
  let query = supabase
    .from('movie_theme_tags')
    .select('id,imdb_id,tag,tag_type,tagger_version')
    .is('user_id', null)
    .not('imdb_id', 'is', null)
    .order('imdb_id', { ascending: true })
    .order('tagger_version', { ascending: true })
    .order('tag_type', { ascending: true })
    .order('tag', { ascending: true })
    .limit(PAGE_SIZE);

  if (lastKey) query = query.gt('imdb_id', lastKey);

  const { data, error } = await query;
  if (error) throw new Error(`Read failed: ${error.message}`);

  const batch = Array.isArray(data) ? data : [];
  batch.forEach((row) => {
    const key = `${row.imdb_id}|${row.tag_type}|${row.tag}|${row.tagger_version || 'v1'}`;
    if (!groupRows.has(key)) groupRows.set(key, []);
    groupRows.get(key).push(row);
  });

  scanned += batch.length;
  if (batch.length) lastKey = batch[batch.length - 1].imdb_id;
  console.log(`Scanned ${scanned} global IMDb tag rows...`);
  if (batch.length < PAGE_SIZE || groupRows.size >= MAX_GROUPS_TO_CLEAN) break;
}

const duplicateIds = [];
let duplicateGroups = 0;

groupRows.forEach((rows) => {
  if (rows.length <= 1) return;
  duplicateGroups += 1;
  const sorted = [...rows].sort((a, b) =>
    rowScore(b) - rowScore(a) ||
    String(a.id).localeCompare(String(b.id))
  );
  duplicateIds.push(...sorted.slice(1).map((row) => row.id));
});

console.log(JSON.stringify({
  scanned,
  uniqueGroups: groupRows.size,
  duplicateGroups,
  duplicateRows: duplicateIds.length,
  dryRun: DRY_RUN,
}, null, 2));

if (!DRY_RUN && duplicateIds.length) {
  await deleteRows(duplicateIds);
}
