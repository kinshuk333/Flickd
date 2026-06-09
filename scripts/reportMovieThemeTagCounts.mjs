import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const readEnv = (file) => {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split(/\r?\n/);
};

const env = Object.fromEntries(
  [...readEnv('.env'), ...readEnv('.env.local')]
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const index = line.indexOf('=');
      return [line.slice(0, index), line.slice(index + 1).replace(/^['"]|['"]$/g, '')];
    })
);

const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const counts = new Map();
const pageSize = 1000;
let lastId = '';

for (;;) {
  let query = supabase
    .from('movie_theme_tags')
    .select('id,cache_key,title,year')
    .order('id', { ascending: true })
    .limit(pageSize);

  if (lastId) query = query.gt('id', lastId);

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  const batch = Array.isArray(data) ? data : [];
  batch.forEach((row) => {
    const key = row.cache_key || `${row.title || ''}|${row.year || ''}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  if (batch.length) {
    lastId = batch[batch.length - 1].id;
  }
  if (batch.length < pageSize) break;
}

const values = Array.from(counts.values()).sort((a, b) => a - b);
const totalTags = values.reduce((sum, count) => sum + count, 0);
const percentile = (p) => values[Math.floor(values.length * p)] || 0;
const distribution = values.reduce((acc, count) => {
  acc[count] = (acc[count] || 0) + 1;
  return acc;
}, {});

console.log(JSON.stringify({
  films: values.length,
  totalTags,
  min: values[0] || 0,
  p25: percentile(0.25),
  median: percentile(0.5),
  p75: percentile(0.75),
  max: values[values.length - 1] || 0,
  average: Number((totalTags / Math.max(values.length, 1)).toFixed(2)),
  distribution,
}, null, 2));
