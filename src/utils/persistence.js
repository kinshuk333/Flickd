// Simple local persistence for offline-first data
const STORAGE_KEY = 'imdb_taste_engine_ratings_v1';

export const loadRatings = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const saveRatings = (ratings) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ratings));
  } catch {
    // ignore
  }
};

export const mergeRatings = (existing, incoming) => {
  const map = new Map();
  (existing || []).forEach((r) => {
    const k = `${r.title}_${r.year}`;
    map.set(k, r);
  });
  (incoming || []).forEach((r) => {
    const k = `${r.title}_${r.year}`;
    map.set(k, r);
  });
  return Array.from(map.values());
};
