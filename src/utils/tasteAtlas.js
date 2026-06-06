const getFirstValue = (object, keys) => {
  for (const key of keys) {
    const value = object?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return '';
};

const getImdbId = (movie) =>
  String(getFirstValue(movie, ['imdbId', 'imdbID', 'const', 'Const', 'tconst']) || '')
    .trim()
    .toLowerCase();

const getTitle = (movie) =>
  String(getFirstValue(movie, ['title', 'Title', 'originalTitle', 'primaryTitle', 'Name']) || '').trim();

const getYear = (movie) => {
  const raw = getFirstValue(movie, ['year', 'Year', 'releaseYear', 'startYear']);
  const year = Number(String(raw || '').match(/\d{4}/)?.[0] || raw);
  return Number.isFinite(year) ? year : 0;
};

const getRatingValue = (movie) =>
  getFirstValue(movie, ['yourRating', 'userRating', 'Your Rating', 'rating', 'Rating']);

const hasRatingField = (movie) =>
  ['yourRating', 'userRating', 'Your Rating', 'rating', 'Rating'].some((key) =>
    Object.prototype.hasOwnProperty.call(movie || {}, key)
  );

export const normalizeTitle = (title) =>
  String(title || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

export const getMovieKey = (movie) => {
  const imdbId = getImdbId(movie);
  if (imdbId) return `imdb:${imdbId}`;

  const title = normalizeTitle(getTitle(movie));
  const year = getYear(movie);
  return title ? `title:${title}|${year || ''}` : '';
};

const getTitleYearKey = (movie) => {
  const title = normalizeTitle(getTitle(movie));
  const year = getYear(movie);
  return title ? `title:${title}|${year || ''}` : '';
};

const isWatchedMovie = (movie) => {
  if (!movie || typeof movie !== 'object') return false;
  if (!hasRatingField(movie)) return true;
  const rating = Number(getRatingValue(movie));
  return Number.isFinite(rating) && rating > 0;
};

const buildUserMovieLookup = (userMovies = []) => {
  const imdbKeys = new Set();
  const titleYearKeys = new Set();

  (Array.isArray(userMovies) ? userMovies : [])
    .filter(isWatchedMovie)
    .forEach((movie) => {
      const imdbId = getImdbId(movie);
      const titleYearKey = getTitleYearKey(movie);
      if (imdbId) imdbKeys.add(`imdb:${imdbId}`);
      if (titleYearKey) titleYearKeys.add(titleYearKey);
    });

  return { imdbKeys, titleYearKeys };
};

export const calculateTasteAtlas = (userMovies = [], lists = []) => {
  const { imdbKeys, titleYearKeys } = buildUserMovieLookup(userMovies);

  return (Array.isArray(lists) ? lists : []).map((list) => {
    const matchedKeys = new Set();
    const matchedFilms = [];
    const missingFilms = [];
    const films = Array.isArray(list?.films) ? list.films : [];

    films.forEach((film) => {
      const imdbId = getImdbId(film);
      const imdbKey = imdbId ? `imdb:${imdbId}` : '';
      const titleYearKey = getTitleYearKey(film);
      const matchKey = imdbKey || titleYearKey || getMovieKey(film);
      const matched =
        (imdbKey && imdbKeys.has(imdbKey)) ||
        (titleYearKey && titleYearKeys.has(titleYearKey));

      if (matched && matchKey && !matchedKeys.has(matchKey)) {
        matchedKeys.add(matchKey);
        matchedFilms.push(film);
      } else if (!matched) {
        missingFilms.push(film);
      }
    });

    const total = films.length;
    const watched = matchedFilms.length;
    const percent = total ? Math.round((watched / total) * 100) : 0;
    const insight = percent >= 65
      ? list?.insightHigh
      : percent >= 30
        ? list?.insightMedium
        : list?.insightLow;

    return {
      id: list?.id || '',
      name: list?.name || '',
      category: list?.category || '',
      description: list?.description || '',
      watched,
      total,
      percent,
      insight: insight || '',
      matchedFilms,
      missingFilms,
    };
  });
};
