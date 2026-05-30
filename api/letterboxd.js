const LETTERBOXD_BASE = 'https://letterboxd.com';
const MAX_PAGES = 250;

const decodeHtml = (value = '') =>
  String(value)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();

const cleanUsername = (value = '') =>
  String(value)
    .trim()
    .replace(/^https?:\/\/(?:www\.)?letterboxd\.com\//i, '')
    .replace(/\/films\/?.*$/i, '')
    .replace(/^@/, '')
    .replace(/[^a-zA-Z0-9_-]/g, '');

const getAttribute = (html, name) => {
  const pattern = new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i');
  return decodeHtml(html.match(pattern)?.[1] || '');
};

const parseTitleAndYear = (value = '') => {
  const text = decodeHtml(value);
  const match = text.match(/^(.*?)\s*\((\d{4})\)\s*$/);
  if (!match) return { title: text.trim(), year: 0 };
  return {
    title: match[1].trim(),
    year: Number(match[2]) || 0,
  };
};

const parseFilmCards = (html) => {
  const cards = [];
  const seen = new Set();
  const cardPattern = /<li\b[^>]*class=["'][^"']*\b(?:poster-container|griditem)\b[^"']*["'][\s\S]*?<\/li>/gi;
  const matches = html.match(cardPattern) || [];

  matches.forEach((card) => {
    const rawTitle =
      getAttribute(card, 'data-film-name') ||
      getAttribute(card, 'data-item-name') ||
      getAttribute(card, 'data-item-full-display-name') ||
      getAttribute(card, 'data-original-title') ||
      getAttribute(card, 'alt');
    const parsedTitle = parseTitleAndYear(rawTitle);
    const title = parsedTitle.title;
    const year =
      Number(getAttribute(card, 'data-film-release-year') || getAttribute(card, 'data-film-year')) ||
      parsedTitle.year ||
      0;
    const slug =
      getAttribute(card, 'data-film-slug') ||
      getAttribute(card, 'data-item-slug') ||
      getAttribute(card, 'data-target-link') ||
      getAttribute(card, 'data-item-link');
    const normalizedSlug = slug ? `/${slug.replace(/^\/+|\/+$/g, '')}/` : '';
    const ratingClass = card.match(/\brated-(\d+)\b/i)?.[1];
    const starText = decodeHtml(card.match(/<span\b[^>]*class=["'][^"']*rating[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] || '');
    const fullStars = (starText.match(/\u2605|&#9733;/g)?.length || 0) * 2;
    const halfStar = /\u00bd|&#189;|&frac12;/i.test(starText) ? 1 : 0;
    const rating = ratingClass ? Number(ratingClass) : fullStars + halfStar;
    const poster =
      getAttribute(card, 'data-src') ||
      getAttribute(card, 'data-image-url') ||
      getAttribute(card, 'src');

    if (!title || !rating || rating <= 0) return;
    const key = `${title.toLowerCase()}|${year}|${normalizedSlug}`;
    if (seen.has(key)) return;
    seen.add(key);

    cards.push({
      title,
      year,
      yourRating: rating,
      letterboxdUrl: normalizedSlug ? `${LETTERBOXD_BASE}${normalizedSlug}` : '',
      letterboxdSlug: normalizedSlug,
      poster: poster && !poster.startsWith('data:') && !poster.includes('empty-poster') ? poster : '',
    });
  });

  return cards;
};

const parseLastPage = (html) => {
  const pageNumbers = [...html.matchAll(/\/films\/page\/(\d+)\/?/gi)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value));
  return Math.max(1, ...pageNumbers);
};

export default async function handler(req, res) {
  const username = cleanUsername(req.query?.username || '');
  if (!username) {
    res.status(400).json({ error: 'Enter a valid Letterboxd username.' });
    return;
  }

  try {
    const firstUrl = `${LETTERBOXD_BASE}/${encodeURIComponent(username)}/films/`;
    const firstResponse = await fetch(firstUrl, {
      headers: {
        'user-agent': 'Flickd/1.0 (+https://flickd.vercel.app)',
        accept: 'text/html,application/xhtml+xml',
      },
    });

    if (!firstResponse.ok) {
      res.status(firstResponse.status === 404 ? 404 : 502).json({ error: 'Could not load that Letterboxd profile.' });
      return;
    }

    const firstHtml = await firstResponse.text();
    const totalPages = Math.min(parseLastPage(firstHtml), MAX_PAGES);
    const films = parseFilmCards(firstHtml);

    for (let page = 2; page <= totalPages; page += 1) {
      const url = `${LETTERBOXD_BASE}/${encodeURIComponent(username)}/films/page/${page}/`;
      const response = await fetch(url, {
        headers: {
          'user-agent': 'Flickd/1.0 (+https://flickd.vercel.app)',
          accept: 'text/html,application/xhtml+xml',
        },
      });
      if (!response.ok) break;
      films.push(...parseFilmCards(await response.text()));
    }

    res.status(200).json({
      username,
      totalPages,
      count: films.length,
      films,
    });
  } catch (error) {
    res.status(500).json({ error: 'Letterboxd import failed. Please try again.' });
  }
}
