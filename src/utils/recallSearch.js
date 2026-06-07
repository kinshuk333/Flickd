import Fuse from 'fuse.js';

const FIELD_KEYS = {
  title: ['title', 'Title', 'name', 'Name', 'originalTitle', 'primaryTitle'],
  year: ['year', 'Year', 'releaseYear', 'startYear'],
  imdbId: ['imdbId', 'imdbID', 'Const', 'const', 'tconst'],
  director: ['director', 'Director', 'directors', 'Directors'],
  genre: ['genre', 'Genre', 'genres', 'Genres'],
  actors: ['actors', 'Actors', 'cast', 'Cast'],
  plot: ['plot', 'Plot', 'overview', 'Overview', 'description', 'Description'],
  country: ['country', 'Country', 'countries', 'Countries'],
  language: ['language', 'Language', 'languages', 'Languages'],
  userRating: ['userRating', 'rating', 'Rating', 'Your Rating', 'yourRating'],
  poster: ['poster', 'Poster', 'posterUrl', 'posterURL', 'image', 'Image'],
  awards: ['awards', 'Awards'],
  keywords: ['keywords', 'Keywords', 'tags', 'Tags'],
};

const SEARCHABLE_FIELDS = [
  'title',
  'year',
  'director',
  'actors',
  'genre',
  'country',
  'language',
  'plot',
  'awards',
  'keywords',
  'userRating',
];

const FIELD_LABELS = {
  title: 'title',
  year: 'year',
  director: 'director',
  actors: 'cast',
  genre: 'genre',
  country: 'country',
  language: 'language',
  plot: 'plot',
  searchableText: 'movie details',
};

const QUERY_EXPANSIONS = {
  rich: ['wealthy', 'affluent', 'elite'],
  korean: ['korea', 'south korea'],
  japanese: ['japan'],
  animated: ['animation', 'anime'],
  dreams: ['dream'],
  dream: ['dreams'],
  space: ['sci fi', 'science fiction', 'spaceship'],
  computer: ['ai', 'artificial intelligence', 'hal'],
  lonely: ['alone', 'isolated', 'alienated'],
};

const safeString = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean).join(', ');
  if (value && typeof value === 'object') return Object.values(value).filter(Boolean).join(', ');
  return value == null ? '' : String(value);
};

export function normalizeText(value) {
  return safeString(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function getField(movie, possibleKeys) {
  const sources = [movie, movie?.data, movie?.details, movie?.metadata].filter(Boolean);
  for (const source of sources) {
    for (const key of possibleKeys) {
      if (source?.[key] !== undefined && source?.[key] !== null && safeString(source[key]).trim()) {
        return safeString(source[key]).trim();
      }
    }
  }
  return '';
}

export function buildRecallSearchItems(userMovies = []) {
  if (!Array.isArray(userMovies)) return [];

  return userMovies
    .map((movie, index) => {
      const item = {
        source: movie,
        index,
        title: getField(movie, FIELD_KEYS.title),
        year: getField(movie, FIELD_KEYS.year),
        imdbId: getField(movie, FIELD_KEYS.imdbId),
        director: getField(movie, FIELD_KEYS.director),
        genre: getField(movie, FIELD_KEYS.genre),
        actors: getField(movie, FIELD_KEYS.actors),
        country: getField(movie, FIELD_KEYS.country),
        language: getField(movie, FIELD_KEYS.language),
        plot: getField(movie, FIELD_KEYS.plot),
        userRating: getField(movie, FIELD_KEYS.userRating),
        poster: getField(movie, FIELD_KEYS.poster),
        awards: getField(movie, FIELD_KEYS.awards),
        keywords: getField(movie, FIELD_KEYS.keywords),
      };

      item.searchableText = SEARCHABLE_FIELDS.map((field) => item[field]).filter(Boolean).join(' ');
      item.normalizedFields = Object.fromEntries(
        [...SEARCHABLE_FIELDS, 'searchableText'].map((field) => [field, normalizeText(item[field])])
      );

      return item;
    })
    .filter((item) => item.title || item.searchableText);
}

const queryTokens = (query) => normalizeText(query)
  .split(' ')
  .filter((token) => token.length >= 3)
  .slice(0, 12);

const expandQuery = (query) => {
  const tokens = queryTokens(query);
  const expansions = tokens.flatMap((token) => QUERY_EXPANSIONS[token] || []);
  return [query, ...expansions].filter(Boolean).join(' ');
};

const confidenceFromScore = (score = 1) => {
  const confidence = Math.round((1 - Math.min(0.82, Math.max(0, score)) / 0.82) * 100);
  return Math.max(38, Math.min(99, confidence));
};

const buildWhyMatched = (item, query, matches = []) => {
  const tokens = queryTokens(query);
  const terms = [];
  const fields = new Set();

  tokens.forEach((token) => {
    for (const field of SEARCHABLE_FIELDS) {
      if (item.normalizedFields?.[field]?.includes(token)) {
        terms.push(token);
        fields.add(FIELD_LABELS[field] || field);
        return;
      }
    }
  });

  matches.forEach((match) => {
    if (match?.key) fields.add(FIELD_LABELS[match.key] || match.key);
  });

  if (terms.length) {
    return `Why this matched: ${Array.from(new Set(terms)).slice(0, 8).join(', ')}`;
  }

  if (fields.size) {
    return `Why this matched: Matched against ${Array.from(fields).slice(0, 5).join(', ')}.`;
  }

  return 'Why this matched: Matched against title, plot, genre, director, or cast details.';
};

const fallbackScore = (item, query) => {
  const expandedQuery = expandQuery(query);
  const normalizedQuery = normalizeText(expandedQuery);
  const tokens = queryTokens(expandedQuery);
  if (!normalizedQuery) return null;

  let score = 0;
  if (item.normalizedFields.title.includes(normalizedQuery)) score += 7;
  if (item.normalizedFields.director.includes(normalizedQuery)) score += 5;
  if (item.normalizedFields.actors.includes(normalizedQuery)) score += 4;

  tokens.forEach((token) => {
    if (item.normalizedFields.title.includes(token)) score += 4;
    if (item.normalizedFields.director.includes(token)) score += 3;
    if (item.normalizedFields.actors.includes(token)) score += 2.5;
    if (item.normalizedFields.genre.includes(token)) score += 2;
    if (item.normalizedFields.country.includes(token)) score += 2;
    if (item.normalizedFields.language.includes(token)) score += 2;
    if (item.normalizedFields.plot.includes(token)) score += 1.5;
    if (item.normalizedFields.searchableText.includes(token)) score += 1;
  });

  if (!score) return null;
  return score;
};

const fallbackSearch = (items, query, existingIndexes = new Set(), limit = 10) => items
  .map((item) => ({ item, score: fallbackScore(item, query) }))
  .filter((result) => result.score !== null && !existingIndexes.has(result.item.index))
  .sort((a, b) => b.score - a.score)
  .slice(0, limit)
  .map((result) => ({
    ...result.item,
    confidence: Math.max(40, Math.min(96, Math.round(result.score * 8))),
    whyMatched: buildWhyMatched(result.item, query),
  }));

export function searchRecallFilms(userMovies = [], query = '') {
  const items = buildRecallSearchItems(userMovies);
  const trimmedQuery = String(query || '').trim();
  if (!items.length || !trimmedQuery) return [];

  try {
    const fuse = new Fuse(items, {
      includeScore: true,
      includeMatches: true,
      ignoreLocation: true,
      minMatchCharLength: 2,
      threshold: 0.52,
      keys: [
        { name: 'title', weight: 0.36 },
        { name: 'director', weight: 0.18 },
        { name: 'actors', weight: 0.14 },
        { name: 'genre', weight: 0.11 },
        { name: 'country', weight: 0.08 },
        { name: 'language', weight: 0.06 },
        { name: 'plot', weight: 0.05 },
        { name: 'searchableText', weight: 0.02 },
      ],
    });

    const expandedQuery = expandQuery(trimmedQuery);
    const fuseResults = fuse.search(expandedQuery, { limit: 10 })
      .filter((result) => Number(result.score) <= 0.58)
      .map((result) => ({
        ...result.item,
        confidence: confidenceFromScore(result.score),
        whyMatched: buildWhyMatched(result.item, trimmedQuery, result.matches),
      }));

    if (fuseResults.length >= 10) return fuseResults.slice(0, 10);

    const existingIndexes = new Set(fuseResults.map((result) => result.index));
    return [
      ...fuseResults,
      ...fallbackSearch(items, trimmedQuery, existingIndexes, 10 - fuseResults.length),
    ].slice(0, 10);
  } catch {
    return fallbackSearch(items, trimmedQuery);
  }
}
