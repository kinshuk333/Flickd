import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.join(repoRoot, '.tmp', 'taste-atlas-sources');
const dataDir = path.join(repoRoot, 'src', 'data', 'tasteAtlas');

const sourceDefinitions = [
  {
    fileName: 'imdb-top250-full.json',
    url: 'https://raw.githubusercontent.com/movie-monk-b0t/top250/master/top250.json',
  },
  {
    fileName: 'sight-and-sound.html',
    url: 'https://www.bfi.org.uk/sight-and-sound/greatest-films-all-time',
  },
  {
    fileName: 'oscar.json',
    sparql: `
SELECT ?film ?filmLabel ?imdb ?year WHERE {
  ?film wdt:P31/wdt:P279* wd:Q11424 ; wdt:P166 wd:Q102427 .
  OPTIONAL { ?film wdt:P345 ?imdb . }
  OPTIONAL { ?film wdt:P577 ?date . BIND(YEAR(?date) AS ?year) }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
ORDER BY ?year ?filmLabel
`,
  },
  {
    fileName: 'cannes.json',
    sparql: `
SELECT ?film ?filmLabel ?imdb ?year WHERE {
  ?film wdt:P31/wdt:P279* wd:Q11424 ; wdt:P166 wd:Q179808 .
  OPTIONAL { ?film wdt:P345 ?imdb . }
  OPTIONAL { ?film wdt:P577 ?date . BIND(YEAR(?date) AS ?year) }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
ORDER BY ?year ?filmLabel
`,
  },
];

const ensureSourceFiles = async () => {
  await fs.mkdir(sourceDir, { recursive: true });

  for (const source of sourceDefinitions) {
    const target = path.join(sourceDir, source.fileName);
    try {
      await fs.access(target);
      continue;
    } catch {
      // Keep going: missing source files are downloaded below.
    }

    const response = source.sparql
      ? await fetch('https://query.wikidata.org/sparql', {
          method: 'POST',
          headers: {
            Accept: 'application/sparql-results+json',
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ query: source.sparql }),
        })
      : await fetch(source.url);

    if (!response.ok) {
      throw new Error(`Could not download ${source.fileName}: ${response.status} ${response.statusText}`);
    }

    await fs.writeFile(target, await response.text(), 'utf8');
  }
};

const repairMojibake = (value) =>
  /[ÃÂâ]/.test(value) ? Buffer.from(value, 'latin1').toString('utf8') : value;

const decodeHtml = (value = '') => repairMojibake(String(value)
  .replace(/<!-- -->/g, '')
  .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
  .replace(/&#(\d+);/g, (_, num) => String.fromCodePoint(Number(num)))
  .replace(/&amp;/g, '&')
  .replace(/&apos;/g, "'")
  .replace(/&quot;/g, '"')
  .replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ')
  .trim());

const normalizeTitle = (title = '') => decodeHtml(title)
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()
  .replace(/\s+/g, ' ');

const getYear = (value) => {
  const match = String(value ?? '').match(/\b(18|19|20)\d{2}\b/);
  return match ? Number(match[0]) : undefined;
};

const getImdbId = (value = '') => {
  const match = String(value).match(/tt\d+/i);
  return match ? match[0].toLowerCase() : undefined;
};

const titleFallbackByImdbId = {
  tt0059362: 'The Knack ...and How to Get It',
  tt0109830: 'Forrest Gump',
};

const dedupeFilms = (films) => {
  const byKey = new Map();

  films.forEach((film) => {
    if (!film.title) return;

    const imdbId = getImdbId(film.imdbId);
    const year = getYear(film.year);
    const key = imdbId || `${normalizeTitle(film.title)}|${year || ''}`;
    const next = {
      title: decodeHtml(film.title),
      ...(year ? { year } : {}),
      ...(imdbId ? { imdbId } : {}),
    };
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, next);
      return;
    }

    const earliestYear = Math.min(existing.year || next.year || Infinity, next.year || existing.year || Infinity);
    byKey.set(key, {
      title: existing.title || next.title,
      ...(earliestYear !== Infinity ? { year: earliestYear } : {}),
      ...(existing.imdbId || next.imdbId ? { imdbId: existing.imdbId || next.imdbId } : {}),
    });
  });

  return [...byKey.values()].sort((a, b) => (a.year || 9999) - (b.year || 9999) || a.title.localeCompare(b.title));
};

const parseWikidataFilms = async (fileName) => {
  const json = JSON.parse(await fs.readFile(path.join(sourceDir, fileName), 'utf8'));
  return dedupeFilms(json.results.bindings.map((row) => ({
    title: /^Q\d+$/.test(row.filmLabel?.value || '')
      ? titleFallbackByImdbId[getImdbId(row.imdb?.value)] || row.filmLabel?.value
      : row.filmLabel?.value,
    year: row.year?.value,
    imdbId: row.imdb?.value,
  })).filter((film) => film.imdbId?.startsWith('tt') || film.title));
};

const parseImdbTop250 = async () => {
  const sourceFile = await fs.access(path.join(sourceDir, 'imdb-top250-full.json'))
    .then(() => 'imdb-top250-full.json')
    .catch(() => 'imdb-top250.json');
  const raw = JSON.parse(await fs.readFile(path.join(sourceDir, sourceFile), 'utf8'));
  return raw.sort((a, b) => {
    const ratingDiff = Number(b.aggregateRating?.ratingValue || 0) - Number(a.aggregateRating?.ratingValue || 0);
    if (ratingDiff) return ratingDiff;
    return Number(b.aggregateRating?.ratingCount || 0) - Number(a.aggregateRating?.ratingCount || 0);
  }).map((movie) => ({
    title: decodeHtml(movie.name),
    year: getYear(movie.datePublished || movie.year),
    imdbId: getImdbId(movie.url || movie.imdb_url),
  }));
};

const parseSightAndSound = async () => {
  const html = await fs.readFile(path.join(sourceDir, 'sight-and-sound.html'), 'utf8');
  return [...html.matchAll(/<article\b[\s\S]*?<\/article>/g)].map((match, index) => {
    const article = match[0];
    const title = decodeHtml(article.match(/<h1>([\s\S]*?)<\/h1>/)?.[1] || '');
    const rank = Number(decodeHtml(article.match(/ResultsPage__Rank[^>]*>([\s\S]*?)<\/p>/)?.[1] || '').match(/\d+/)?.[0]);
    const yearBlock = article.match(/<span id="rank-[\s\S]*?<\/span>\s*<p[^>]*>([\s\S]*?)<\/p>/)?.[1] || '';
    const year = getYear(decodeHtml(yearBlock));
    return {
      title,
      rank,
      index,
      ...(year ? { year } : {}),
    };
  })
    .filter((film) => film.title)
    .sort((a, b) => (a.rank || 9999) - (b.rank || 9999) || a.index - b.index)
    .map(({ title, year }) => ({ title, ...(year ? { year } : {}) }));
};

const stringifyFilm = (film) => {
  const parts = [`title: ${JSON.stringify(film.title)}`];
  if (film.year) parts.push(`year: ${film.year}`);
  if (film.imdbId) parts.push(`imdbId: ${JSON.stringify(film.imdbId)}`);
  return `    { ${parts.join(', ')} }`;
};

const writeModule = async (fileName, meta) => {
  const lines = [
    `export const ${meta.exportName} = {`,
    `  id: ${JSON.stringify(meta.id)},`,
    `  name: ${JSON.stringify(meta.name)},`,
    `  category: ${JSON.stringify(meta.category)},`,
    `  description: ${JSON.stringify(meta.description)},`,
    `  insightHigh: ${JSON.stringify(meta.insightHigh)},`,
    `  insightMedium: ${JSON.stringify(meta.insightMedium)},`,
    `  insightLow: ${JSON.stringify(meta.insightLow)},`,
    '  films: [',
    ...meta.films.map((film) => `${stringifyFilm(film)},`),
    '  ],',
    '};',
    '',
  ];
  await fs.writeFile(path.join(dataDir, fileName), lines.join('\n'), 'utf8');
};

await ensureSourceFiles();

const imdbFilms = await parseImdbTop250();
const oscarFilms = await parseWikidataFilms('oscar.json');
const cannesFilms = await parseWikidataFilms('cannes.json');
const sightFilms = await parseSightAndSound();

const modules = {
  'imdbTop250.js': {
    exportName: 'imdbTop250',
    id: 'imdb-top-250',
    name: 'IMDb Top 250',
    category: 'Popular Canon',
    description: 'How much of the popular movie canon you have explored.',
    insightHigh: 'You are strongly aligned with popular canon cinema.',
    insightMedium: 'You have a solid base in popular canon cinema.',
    insightLow: 'You still have many widely loved classics left to explore.',
    films: imdbFilms,
  },
  'oscarBestPicture.js': {
    exportName: 'oscarBestPicture',
    id: 'oscar-best-picture',
    name: 'Oscar Best Picture Winners',
    category: 'Awards Canon',
    description: 'How deeply your history overlaps with Academy Best Picture winners.',
    insightHigh: 'You have travelled deeply through Academy canon cinema.',
    insightMedium: 'You have a meaningful foothold in Oscar-winning cinema.',
    insightLow: 'The Academy canon is still mostly waiting for you.',
    films: oscarFilms,
  },
  'cannesPalmeDor.js': {
    exportName: 'cannesPalmeDor',
    id: 'cannes-palme-dor',
    name: "Cannes Palme d'Or Winners",
    category: 'Festival Canon',
    description: "How much of Cannes' top festival lineage you have seen.",
    insightHigh: "You are strongly connected to Cannes' festival canon.",
    insightMedium: "You have a sturdy bridge into Cannes' festival history.",
    insightLow: "Cannes' grand-prize lineage is still wide open for you.",
    films: cannesFilms,
  },
  'sightAndSound.js': {
    exportName: 'sightAndSound',
    id: 'sight-and-sound',
    name: 'Sight & Sound Greatest Films',
    category: 'Critical Canon',
    description: 'How much of the critical and historical film canon you have explored.',
    insightHigh: 'You are deeply rooted in the critical canon.',
    insightMedium: 'You have a strong starting map of critical film history.',
    insightLow: 'The critical canon still has a lot of new terrain for you.',
    films: sightFilms,
  },
};

for (const [fileName, meta] of Object.entries(modules)) {
  await writeModule(fileName, meta);
}

console.log(JSON.stringify({
  imdbTop250: imdbFilms.length,
  oscarBestPicture: oscarFilms.length,
  cannesPalmeDor: cannesFilms.length,
  sightAndSound: sightFilms.length,
}, null, 2));
