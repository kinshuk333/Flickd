import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList
} from 'recharts';

const ACCENT_COLOR = '#3b82f6';
const CHART_COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981'];

export default function App() {
  const [data, setData] = useState(null);
  const [fileName, setFileName] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [hiddenTreasuresPage, setHiddenTreasuresPage] = useState(1);
  const [hiddenGemsPage, setHiddenGemsPage] = useState(1);
  const [expandedGenres, setExpandedGenres] = useState({});
  const [expandedDecades, setExpandedDecades] = useState([]);
  const [selectedFavoriteYear, setSelectedFavoriteYear] = useState(null);
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [movieDetails, setMovieDetails] = useState(null);
  const [fetchingMovieDetails, setFetchingMovieDetails] = useState(false);
  const [posters, setPosters] = useState({});
  const [fetchingCountries, setFetchingCountries] = useState(false);
  const [fetchProgress, setFetchProgress] = useState({ current: 0, total: 0 });

  const OMDB_API_KEY = '169bcd7e';

  const itemsPerPage = 20;
  const hiddenGemsPerPage = 10;

  const cleanTitleForOmdb = (title) => {
    if (!title || typeof title !== 'string') return '';
    let cleaned = title.trim();
    cleaned = cleaned.replace(/\s*\(\d{4}(–\d{4})?\)$/i, '');
    cleaned = cleaned.replace(/\s*\([IVXLCDMivxlcdm]+\)$/i, '');
    cleaned = cleaned.replace(/\s*-\s*(Director's Cut|Extended Cut|Uncut|International Version)$/i, '');
    cleaned = cleaned.replace(/\s*:\s*(Extended|Unrated|Director's Cut)$/i, '');
    cleaned = cleaned.replace(/\s*\[.*?\]$/g, '');
    return cleaned.replace(/\s+/g, ' ').trim();
  };

  const parseExcelDate = (excelDate) => {
    if (!excelDate) return null;
    if (typeof excelDate === 'string') {
      const parsed = new Date(excelDate);
      return isNaN(parsed.getTime()) ? null : parsed;
    }
    if (typeof excelDate === 'number') {
      const date = new Date((excelDate - 25569) * 86400 * 1000);
      return isNaN(date.getTime()) ? null : date;
    }
    return null;
  };

  const fetchCountryData = async (movies, apiKey) => {
    const highRated = movies.filter(m => m.yourRating >= 8);
    const others = movies.filter(m => m.yourRating < 8);

    if (highRated.length === 0) return movies;

    setFetchingCountries(true);
    setFetchProgress({ current: 0, total: highRated.length });

    const cache = JSON.parse(localStorage.getItem('countryCache') || '{}');
    const updated = [];

    const BATCH_SIZE = 50; // Increased for faster fetching

    for (let i = 0; i < highRated.length; i += BATCH_SIZE) {
      const batch = highRated.slice(i, i + BATCH_SIZE);

      const promises = batch.map(async (movie) => {
        const key = `${movie.title}_${movie.year}`;
        if (cache[key]) return { ...movie, country: cache[key] };

        const cleanTitle = cleanTitleForOmdb(movie.title);

        try {
          const res = await fetch(
            `https://www.omdbapi.com/?t=${encodeURIComponent(cleanTitle)}&y=${movie.year}&apikey=${apiKey}`
          );
          const json = await res.json();

          if (json.Response === 'True' && json.Country) {
            const country = json.Country.split(',')[0].trim();
            cache[key] = country;
            return { ...movie, country };
          }
        } catch (e) {}
        cache[key] = 'Unknown';
        return { ...movie, country: 'Unknown' };
      });

      const results = await Promise.all(promises);
      updated.push(...results);

      setFetchProgress({ current: updated.length, total: highRated.length });
    }
    
    // Save cache after all batches complete
    localStorage.setItem('countryCache', JSON.stringify(cache));

    setFetchingCountries(false);
    return [...updated, ...others];
  };

  const fetchMovieDetails = async (title, year) => {
    setFetchingMovieDetails(true);
    setMovieDetails(null);
    
    const cleanTitle = cleanTitleForOmdb(title);
    const cacheKey = `details_${cleanTitle}_${year}`;
    const cache = JSON.parse(localStorage.getItem('movieDetailsCache') || '{}');
    
    if (cache[cacheKey]) {
      setMovieDetails(cache[cacheKey]);
      setFetchingMovieDetails(false);
      return;
    }

    try {
      const res = await fetch(
        `https://www.omdbapi.com/?t=${encodeURIComponent(cleanTitle)}&y=${year}&apikey=${OMDB_API_KEY}&plot=full`
      );
      const json = await res.json();
      
      if (json.Response === 'True') {
        cache[cacheKey] = json;
        localStorage.setItem('movieDetailsCache', JSON.stringify(cache));
        setMovieDetails(json);
      } else {
        setMovieDetails({ Error: json.Error || 'Movie not found' });
      }
    } catch (e) {
      setMovieDetails({ Error: 'Failed to fetch details' });
    }
    
    setFetchingMovieDetails(false);
  };

  const handleMovieClick = (movie) => {
    setSelectedMovie(movie);
    fetchMovieDetails(movie.title, movie.year);
  };

  const closeMovieModal = () => {
    setSelectedMovie(null);
    setMovieDetails(null);
  };

  const fetchPoster = async (title, year) => {
    const key = `${title}_${year}`;
    
    const cache = JSON.parse(localStorage.getItem('posterCache') || '{}');
    if (cache[key]) {
      setPosters(prev => ({ ...prev, [key]: cache[key] }));
      return cache[key];
    }
    
    if (posters[key]) return posters[key];

    try {
      const res = await fetch(
        `https://www.omdbapi.com/?t=${encodeURIComponent(cleanTitleForOmdb(title))}&y=${year}&apikey=${OMDB_API_KEY}`
      );
      const json = await res.json();
      if (json.Response === 'True' && json.Poster && json.Poster !== 'N/A') {
        cache[key] = json.Poster;
        localStorage.setItem('posterCache', JSON.stringify(cache));
        setPosters(prev => ({ ...prev, [key]: json.Poster }));
        return json.Poster;
      }
    } catch (e) {
      console.log('Poster fetch error:', title);
    }
    return null;
  };

  const loadPostersForFilms = async (films) => {
    const toLoad = films.slice(0, 20);
    // Load all in parallel - let OMDB handle the rate limiting
    await Promise.all(toLoad.map(f => fetchPoster(f.title, f.year)));
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target.result;
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(sheet);

        const cleanedData = jsonData
          .filter(row => row['Your Rating'])
          .map(row => {
            const dateRated = parseExcelDate(row['Date Rated']);
            let numVotes = 0;
            if (row['Num Votes']) {
              numVotes = parseInt(String(row['Num Votes']).replace(/,/g, '')) || 0;
            }
            return {
              title: row['Title'] || 'Unknown',
              year: row['Year'] || 0,
              yourRating: parseFloat(row['Your Rating']) || 0,
              imdbRating: parseFloat(row['IMDb Rating']) || 0,
              dateRated,
              runtime: parseInt(row['Runtime (mins)']) || 0,
              genres: row['Genres'] || '',
              directors: row['Directors'] || '',
              numVotes,
              country: undefined
            };
          })
          .filter(row => row.yourRating > 0);

        setData(cleanedData);

        const withCountry = await fetchCountryData(cleanedData, OMDB_API_KEY);
        setData(withCountry);
      } catch (err) {
        alert('Error reading file. Please use a valid IMDb ratings export.');
        console.error(err);
      }
    };

    reader.readAsArrayBuffer(file);
  };

  const getSummaryStats = () => {
    if (!data?.length) return null;
    const total = data.length;
    const avgYour = (data.reduce((s, m) => s + (m.yourRating || 0), 0) / total).toFixed(1);
    const avgDiff = (data.reduce((s, m) => s + ((m.yourRating || 0) - (m.imdbRating || 0)), 0) / total).toFixed(2);

    const genreCounts = {};
    data.forEach(m => (m.genres || '').split(',').map(g => g.trim()).forEach(g => {
      if (g) genreCounts[g] = (genreCounts[g] || 0) + 1;
    }));
    const mostRatedGenre = Object.entries(genreCounts).sort((a,b) => b[1] - a[1])[0]?.[0] || 'N/A';

    return { totalFilms: total, avgYourRating: avgYour, avgDifference: avgDiff, mostRatedGenre };
  };

  const getRatingDistribution = () => {
    if (!data) return [];
    const dist = Array(11).fill(0);
    data.forEach(m => {
      const r = Math.round(m?.yourRating || 0);
      if (r >= 1 && r <= 10) dist[r]++;
    });
    return dist.slice(1).map((count, i) => ({ rating: i + 1, count }));
  };

  const getGenreAffinity = () => {
    if (!data) return [];
    const stats = {};
    data.forEach(m => {
      (m.genres || '').split(',').map(g => g.trim()).forEach(g => {
        if (g) {
          stats[g] = stats[g] || { sum: 0, count: 0 };
          stats[g].sum += m.yourRating || 0;
          stats[g].count++;
        }
      });
    });
    return Object.entries(stats)
      .map(([genre, s]) => ({ genre, avgRating: (s.sum / s.count).toFixed(2), count: s.count }))
      .filter(g => g.count >= 3)
      .sort((a,b) => b.avgRating - a.avgRating)
      .slice(0,10);
  };

  const getEraPreference = () => {
    if (!data) return [];
    const decades = {};
    data.forEach(m => {
      if (m.year >= 1950) {
        const dec = Math.floor(m.year / 10) * 10;
        const label = `${dec}s`;
        decades[label] = decades[label] || { sum: 0, count: 0 };
        decades[label].sum += m.yourRating || 0;
        decades[label].count++;
      }
    });
    return Object.entries(decades)
      .map(([decade, s]) => ({ decade, avgRating: (s.sum / s.count).toFixed(2), count: s.count }))
      .sort((a,b) => parseInt(a.decade) - parseInt(b.decade));
  };

  const getHiddenGems = () => {
    if (!data) return { films: [], allFilms: [] };
    const gems = data
      .filter(m => (m.yourRating || 0) - (m.imdbRating || 0) > 2.5)
      .map(m => ({ ...m, difference: ((m.yourRating || 0) - (m.imdbRating || 0)).toFixed(1) }))
      .sort((a,b) => b.difference - a.difference);
    return { films: gems.slice(0,20), allFilms: gems };
  };

  const getFavoriteFilmPerYear = () => {
    if (!data) return [];
    const groups = {};
    data.forEach(m => {
      if (m.year >= 1900 && m.yourRating >= 9) {
        groups[m.year] = groups[m.year] || [];
        groups[m.year].push(m);
      }
    });
    return Object.entries(groups)
      .map(([year, films]) => ({
        year: +year,
        films: films.sort((a,b) => b.yourRating - a.yourRating),
        filmCount: films.length
      }))
      .sort((a,b) => b.year - a.year);
  };

  const getPersonalCanonByDecade = () => {
    if (!data) return [];
    const groups = {};
    data.forEach(m => {
      if (m.year >= 1950 && m.yourRating >= 9) {
        const dec = Math.floor(m.year / 10) * 10;
        const label = `${dec}s`;
        groups[label] = groups[label] || [];
        groups[label].push(m);
      }
    });
    return Object.entries(groups)
      .map(([decade, films]) => ({
        decade,
        films: films.sort((a,b) => b.yourRating - a.yourRating),
        filmCount: films.length
      }))
      .sort((a,b) => parseInt(a.decade) - parseInt(b.decade));
  };

  const getYearlyHighlight = () => {
    if (!data) return [];
    const groups = {};
    data.forEach(m => {
      if (m.year >= 1900) {
        groups[m.year] = groups[m.year] || { sum: 0, count: 0 };
        groups[m.year].sum += m.yourRating || 0;
        groups[m.year].count++;
      }
    });
    return Object.entries(groups)
      .map(([year, s]) => ({
        year: +year,
        filmCount: s.count,
        avgRating: s.count ? (s.sum / s.count).toFixed(2) : '0.0'
      }))
      .sort((a,b) => a.year - b.year);
  };

  const getTopFilmPerGenre = () => {
    if (!data) return [];
    const genreCounts = {};
    data.forEach(m => (m.genres || '').split(',').map(g=>g.trim()).forEach(g => {
      if (g) genreCounts[g] = (genreCounts[g] || 0) + 1;
    }));
    const topGenres = Object.entries(genreCounts).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([g])=>g);

    const genreAvgs = {};
    topGenres.forEach(g => {
      const films = data.filter(m => (m.genres || '').includes(g));
      genreAvgs[g] = films.length ? films.reduce((s,m)=>s+(m.yourRating||0),0)/films.length : 0;
    });

    const used = new Set();
    return topGenres.map(genre => {
      const films = data
        .filter(m => (m.genres || '').includes(genre) && !used.has(m.title))
        .sort((a,b) => (b.yourRating||0) - (a.yourRating||0) || (b.imdbRating||0) - (a.imdbRating||0))
        .slice(0,50);
      films.forEach(m => used.add(m.title));
      return { genre, films, avgGenreRating: genreAvgs[genre] };
    }).sort((a,b) => b.avgGenreRating - a.avgGenreRating);
  };

  const getMostConsistentlyLovedDirectors = () => {
    if (!data) return [];
    const stats = {};
    data.forEach(m => {
      (m.directors || '').split(',').map(d=>d.trim()).forEach(d => {
        if (d) {
          stats[d] = stats[d] || { total: 0, highRated: 0 };
          stats[d].total++;
          if (m.yourRating >= 8) stats[d].highRated++;
        }
      });
    });
    return Object.entries(stats)
      .filter(([,s]) => s.total >= 5)
      .map(([director, s]) => ({
        director,
        highRatedCount: s.highRated,
        totalFilms: s.total,
        percentage: Math.round(s.highRated / s.total * 100)
      }))
      .sort((a,b) => b.highRatedCount - a.highRatedCount);
  };

  const getHiddenTreasures = () => {
    if (!data) return { films: [], stats: null, allFilms: [] };
    const treasures = data.filter(m => (m.numVotes || 0) < 2000 && m.yourRating >= 8);
    const stats = treasures.length ? {
      count: treasures.length,
      avgYourRating: (treasures.reduce((s,m)=>s+(m.yourRating||0),0)/treasures.length).toFixed(2),
      avgVoteCount: Math.round(treasures.reduce((s,m)=>s+(m.numVotes||0),0)/treasures.length)
    } : null;
    const sorted = treasures
      .map(m => ({ ...m, difference: ((m.yourRating||0) - (m.imdbRating||0)).toFixed(1) }))
      .sort((a,b) => b.difference - a.difference || (a.numVotes||0) - (b.numVotes||0));
    return { films: sorted.slice(0,20), stats, allFilms: sorted };
  };

  const getMostWatchedGenres = () => {
    if (!data) return { genres: [], totalGenres: 0, topGenre: null };
    const counts = {};
    data.forEach(m => {
      (m.genres || '').split(',').map(g=>g.trim()).filter(Boolean).forEach(g => {
        counts[g] = (counts[g] || 0) + 1;
      });
    });
    const filtered = Object.entries(counts).filter(([,c])=>c>=3).sort((a,b)=>b[1]-a[1]);
    const top10 = filtered.slice(0,10).map(([genre,count]) => ({
      genre, count,
      percentage: ((count / data.length) * 100).toFixed(1)
    }));
    return { genres: top10, totalGenres: filtered.length, topGenre: top10[0] || null };
  };

  const getCountryPreference = () => {
    if (!data) return [];
    const countryStats = {};
    data.forEach(movie => {
      if (
        movie.yourRating >= 8 &&
        movie.country &&
        typeof movie.country === 'string' &&
        movie.country !== 'Unknown' &&
        movie.country.trim()
      ) {
        const c = movie.country;
        countryStats[c] = countryStats[c] || { count: 0 };
        countryStats[c].count++;
      }
    });
    return Object.entries(countryStats)
      .map(([country, {count}]) => ({ country, count }))
      .filter(c => c.count >= 1)
      .sort((a,b) => b.count - a.count)
      .slice(0,20);
  };

  const stats = getSummaryStats();
  const ratingDist = getRatingDistribution();
  const genreAffinity = getGenreAffinity();
  const eraPreference = getEraPreference();
  const hiddenGems = getHiddenGems();
  const favoriteFilmPerYear = getFavoriteFilmPerYear();
  const personalCanon = getPersonalCanonByDecade();
  const yearlyHighlight = getYearlyHighlight();
  const topFilmPerGenre = getTopFilmPerGenre();
  const consistentlyLovedDirectors = getMostConsistentlyLovedDirectors();
  const hiddenTreasures = getHiddenTreasures();
  const mostWatchedGenres = getMostWatchedGenres();
  const countryPreference = getCountryPreference();

  React.useEffect(() => {
    if (!data || data.length === 0) return;
    
    // Load posters for first 30 films immediately
    const initialFilms = data.slice(0, 30);
    loadPostersForFilms(initialFilms);
  }, [data]);

  return (
    <div className="min-h-screen bg-[#111] text-white pb-8">
      {selectedMovie && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm" onClick={closeMovieModal}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl max-w-xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-gray-900 border-b border-gray-700 p-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Movie Details</h2>
              <button onClick={closeMovieModal} className="text-gray-400 hover:text-white text-xl">&times;</button>
            </div>
            
            <div className="p-4">
              {fetchingMovieDetails ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-4 border-blue-500 mb-3"></div>
                  <p className="text-gray-400 text-sm">Fetching movie details...</p>
                </div>
              ) : movieDetails ? (
                movieDetails.Error ? (
                  <div className="text-center py-6 text-red-400">{movieDetails.Error}</div>
                ) : (
                  <div className="space-y-4">
                    {movieDetails.Poster && movieDetails.Poster !== 'N/A' && (
                      <div className="flex justify-center">
                        <img src={movieDetails.Poster} alt={movieDetails.Title} className="max-h-56 rounded-lg shadow-lg" />
                      </div>
                    )}
                    
                    <div>
                      <h3 className="text-xl font-bold text-white mb-2">{movieDetails.Title}</h3>
                      <div className="flex flex-wrap gap-2 text-xs">
                        {movieDetails.Year && <span className="bg-gray-800 px-2 py-0.5 rounded-full">{movieDetails.Year}</span>}
                        {movieDetails.Rated && <span className="bg-gray-800 px-2 py-0.5 rounded-full">{movieDetails.Rated}</span>}
                        {movieDetails.Runtime && <span className="bg-gray-800 px-2 py-0.5 rounded-full">{movieDetails.Runtime}</span>}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-gray-800 p-3 rounded-lg text-center">
                        <p className="text-gray-400 text-xs">IMDb Rating</p>
                        <p className="text-2xl font-bold text-yellow-400">★ {movieDetails.imdbRating}</p>
                      </div>
                      <div className="bg-gray-800 p-3 rounded-lg text-center">
                        <p className="text-gray-400 text-xs">Your Rating</p>
                        <p className="text-2xl font-bold text-green-400">★ {selectedMovie.yourRating}</p>
                      </div>
                    </div>

                    {movieDetails.Genre && (
                      <div>
                        <h4 className="text-gray-400 text-xs mb-1">Genres</h4>
                        <div className="flex flex-wrap gap-1.5">
                          {movieDetails.Genre.split(', ').map((g, i) => (
                            <span key={i} className="bg-blue-900/50 text-blue-300 px-2 py-0.5 rounded-full text-xs">{g}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {movieDetails.Plot && movieDetails.Plot !== 'N/A' && (
                      <div>
                        <h4 className="text-gray-400 text-xs mb-1">Plot</h4>
                        <p className="text-gray-300 text-sm leading-relaxed">{movieDetails.Plot}</p>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {movieDetails.Director && movieDetails.Director !== 'N/A' && (
                        <div>
                          <p className="text-gray-400">Director</p>
                          <p className="text-white font-medium">{movieDetails.Director}</p>
                        </div>
                      )}
                      {movieDetails.Writer && movieDetails.Writer !== 'N/A' && (
                        <div>
                          <p className="text-gray-400">Writer</p>
                          <p className="text-white font-medium">{movieDetails.Writer}</p>
                        </div>
                      )}
                      {movieDetails.Actors && movieDetails.Actors !== 'N/A' && (
                        <div className="col-span-2">
                          <p className="text-gray-400">Cast</p>
                          <p className="text-white font-medium">{movieDetails.Actors}</p>
                        </div>
                      )}
                      {movieDetails.Country && movieDetails.Country !== 'N/A' && (
                        <div>
                          <p className="text-gray-400">Country</p>
                          <p className="text-white font-medium">{movieDetails.Country}</p>
                        </div>
                      )}
                      {movieDetails.Language && movieDetails.Language !== 'N/A' && (
                        <div>
                          <p className="text-gray-400">Language</p>
                          <p className="text-white font-medium">{movieDetails.Language}</p>
                        </div>
                      )}
                      {movieDetails.BoxOffice && movieDetails.BoxOffice !== 'N/A' && (
                        <div>
                          <p className="text-gray-400">Box Office</p>
                          <p className="text-white font-medium">{movieDetails.BoxOffice}</p>
                        </div>
                      )}
                      {movieDetails.Awards && movieDetails.Awards !== 'N/A' && (
                        <div>
                          <p className="text-gray-400">Awards</p>
                          <p className="text-yellow-300 font-medium">{movieDetails.Awards}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )
              ) : null}
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">

        {/* Hero Header - inspired by MusicTaste */}
        <div className="mb-8 relative overflow-hidden rounded-3xl bg-gradient-to-br from-pink-900/40 via-purple-900/30 to-indigo-900/40 border border-pink-500/20 shadow-2xl shadow-purple-500/10">
          <div className="absolute top-0 right-0 w-80 h-80 bg-pink-500/20 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/20 rounded-full blur-3xl"></div>
          <div className="relative py-10 px-6 sm:px-10 text-center">
            <div className="flex justify-center mb-4">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500 rounded-full blur-xl opacity-75 animate-pulse"></div>
                <span className="relative text-6xl">🎬</span>
              </div>
            </div>
            <h1 className="text-4xl sm:text-5xl font-black mb-4 bg-gradient-to-r from-white via-pink-200 to-purple-200 bg-clip-text text-transparent tracking-tight">
              IMDb Taste Engine
            </h1>
            <p className="text-gray-300 text-lg sm:text-xl max-w-2xl mx-auto mb-6">
              Discover your <span className="text-pink-400 font-bold">cinematic identity</span> 💫 
              Find hidden gems, explore your preferences & build your personal film canon.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <div className="flex items-center gap-2 px-4 py-2 bg-black/30 backdrop-blur-sm rounded-full border border-white/10">
                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                <span className="text-sm text-gray-300">100% Private</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 bg-black/30 backdrop-blur-sm rounded-full border border-white/10">
                <span className="text-lg">⚡</span>
                <span className="text-sm text-gray-300">Lightning Fast</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 bg-black/30 backdrop-blur-sm rounded-full border border-white/10">
                <span className="text-lg">🎯</span>
                <span className="text-sm text-gray-300">Deep Insights</span>
              </div>
            </div>
          </div>
        </div>

        {/* Fun Upload Area */}
        <div className="mb-8">
          <label className="flex flex-col items-center justify-center h-44 border-2 border-dashed border-pink-500/30 rounded-3xl cursor-pointer bg-gradient-to-br from-gray-900/80 via-purple-900/20 to-pink-900/20 hover:from-pink-900/30 hover:via-purple-900/30 hover:to-pink-900/30 hover:border-pink-500/50 transition-all duration-300 group hover:shadow-xl hover:shadow-purple-500/20">
            <div className="flex flex-col items-center justify-center">
              <div className="relative mb-4">
                <div className="absolute inset-0 bg-gradient-to-r from-pink-500 to-purple-500 rounded-full blur-xl opacity-40 group-hover:opacity-70 transition-all duration-300 group-hover:scale-110"></div>
                <svg className="relative w-14 h-14 text-pink-400 group-hover:scale-110 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <p className="text-lg font-bold text-white group-hover:text-pink-200 transition-colors">
                Drop your IMDb file here
              </p>
              <p className="mt-2 text-sm text-gray-400">or click to browse • .csv .xlsx .xls</p>
            </div>
            <input type="file" className="hidden" accept=".csv,.xlsx,.xls" onChange={handleFileUpload} />
          </label>

          {fileName && (
            <div className="mt-5 flex items-center justify-center gap-3 p-4 bg-gradient-to-r from-pink-500/20 via-purple-500/20 to-blue-500/20 border border-pink-500/30 rounded-2xl animate-fade-in">
              <span className="text-2xl">✨</span>
              <p className="text-gray-200 font-medium">
                Loaded: <span className="text-pink-400 font-bold">{fileName}</span>
              </p>
              <span className="text-xl">🎬</span>
            </div>
          )}

          {fetchingCountries && (
            <div className="mt-6 p-6 bg-gradient-to-r from-pink-900/40 via-purple-900/40 to-indigo-900/40 border border-pink-500/20 rounded-3xl shadow-xl shadow-purple-500/10">
              <div className="flex items-center gap-5">
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-r from-pink-500 to-purple-500 rounded-full blur-xl opacity-75 animate-pulse"></div>
                  <div className="relative animate-spin rounded-full h-14 w-14 border-3 border-pink-400 border-t-transparent"></div>
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-white mb-1">🗺️ Mapping your film universe</h3>
                  <p className="text-sm text-pink-300 mb-3">Processing {fetchProgress.total} highly-rated films</p>
                  <div className="w-full bg-black/30 rounded-full h-3 overflow-hidden backdrop-blur-sm">
                    <div 
                      className="h-full bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500 rounded-full transition-all duration-500 shadow-lg shadow-pink-500/50"
                      style={{ width: `${fetchProgress.total ? (fetchProgress.current / fetchProgress.total) * 100 : 0}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    {fetchProgress.current} / {fetchProgress.total} complete
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
          )}

          {fetchingCountries && (
            <div className="mt-6 p-6 bg-gradient-to-r from-purple-900/40 via-gray-900/80 to-blue-900/40 border border-purple-500/20 rounded-2xl">
              <div className="flex items-center gap-5">
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full blur-md animate-pulse"></div>
                  <div className="relative animate-spin rounded-full h-12 w-12 border-2 border-purple-400 border-t-transparent"></div>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-white mb-1">🗺️ Mapping your film universe</h3>
                  <p className="text-xs text-purple-300 mb-3">Processing {fetchProgress.total} highly-rated films</p>
                  <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-purple-500 via-pink-500 to-blue-500 rounded-full transition-all duration-500"
                      style={{ width: `${fetchProgress.total ? (fetchProgress.current / fetchProgress.total) * 100 : 0}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    {fetchProgress.current} / {fetchProgress.total} complete
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {((!fetchingCountries && data && stats) ? (
          <div className="">
            <div className="mb-8 border-b border-gray-800">
              <nav className="flex flex-wrap gap-2 sm:gap-2 -mb-px justify-center sm:justify-start">
                {[
                  { id: 'overview',       label: '📊 Overview' },
                  { id: 'preferences',    label: '🎯 Preferences' },
                  { id: 'discoveries',    label: '💎 Discoveries' },
                  { id: 'deepdive',       label: '🔍 Deep Dive' },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveTab(tab.id);
                      if (tab.id === 'discoveries' || tab.id === 'deepdive') {
                        const filmsToLoad = [];
                        if (tab.id === 'discoveries') {
                          hiddenGems.allFilms?.slice(0, 10).forEach(f => filmsToLoad.push(f));
                          hiddenTreasures.allFilms?.slice(0, 10).forEach(f => filmsToLoad.push(f));
                        } else {
                          favoriteFilmPerYear.slice(0, 5).forEach(y => y.films?.slice(0, 3).forEach(f => filmsToLoad.push(f)));
                          personalCanon.slice(-3).forEach(d => d.films?.slice(0, 3).forEach(f => filmsToLoad.push(f)));
                          topFilmPerGenre.slice(0, 5).forEach(g => g.films?.slice(0, 3).forEach(f => filmsToLoad.push(f)));
                        }
                        const unique = [...new Map(filmsToLoad.map(f => [`${f.title}_${f.year}`, f])).values()];
                        loadPostersForFilms(unique.slice(0, 20));
                      }
                    }}
                    className={`
                      px-5 py-2.5 font-medium rounded-xl transition-all text-sm relative overflow-hidden
                      ${activeTab === tab.id
                        ? 'bg-gradient-to-r from-pink-500/80 to-purple-500/80 text-white shadow-lg shadow-pink-500/30'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'}
                    `}
                  >
                    <span className="relative">{tab.label}</span>
                  </button>
                ))}
              </nav>
            </div>

            <div className="space-y-8">

              {activeTab === 'overview' && (
                <>
                  {/* Stats Grid - fun colorful cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
                    <div className="relative bg-gradient-to-br from-pink-900/40 to-purple-900/40 border border-pink-500/30 rounded-2xl p-5 hover:from-pink-900/60 hover:to-purple-900/60 hover:border-pink-500/50 transition-all duration-300 group hover:shadow-lg hover:shadow-pink-500/20">
                      <div className="absolute top-0 right-0 w-20 h-20 bg-pink-500/10 rounded-full -mr-10 -mt-10 group-hover:bg-pink-500/20 transition-all"></div>
                      <div className="text-pink-400 text-xs font-bold mb-1">🎬</div>
                      <div className="text-gray-400 text-xs mb-1">Total Films</div>
                      <div className="text-4xl font-black text-white">{stats.totalFilms}</div>
                    </div>
                    <div className="relative bg-gradient-to-br from-purple-900/40 to-indigo-900/40 border border-purple-500/30 rounded-2xl p-5 hover:from-purple-900/60 hover:to-indigo-900/60 hover:border-purple-500/50 transition-all duration-300 group hover:shadow-lg hover:shadow-purple-500/20">
                      <div className="absolute top-0 right-0 w-20 h-20 bg-purple-500/10 rounded-full -mr-10 -mt-10 group-hover:bg-purple-500/20 transition-all"></div>
                      <div className="text-purple-400 text-xs font-bold mb-1">⭐</div>
                      <div className="text-gray-400 text-xs mb-1">Your Avg</div>
                      <div className="text-4xl font-black text-white">{stats.avgYourRating}</div>
                    </div>
                    <div className="relative bg-gradient-to-br from-indigo-900/40 to-blue-900/40 border border-indigo-500/30 rounded-2xl p-5 hover:from-indigo-900/60 hover:to-blue-900/60 hover:border-indigo-500/50 transition-all duration-300 group hover:shadow-lg hover:shadow-indigo-500/20">
                      <div className="absolute top-0 right-0 w-20 h-20 bg-indigo-500/10 rounded-full -mr-10 -mt-10 group-hover:bg-indigo-500/20 transition-all"></div>
                      <div className="text-indigo-400 text-xs font-bold mb-1">📈</div>
                      <div className="text-gray-400 text-xs mb-1">vs IMDb</div>
                      <div className="text-4xl font-black text-white">
                        {stats.avgDifference > 0 ? '+' : ''}{stats.avgDifference}
                      </div>
                    </div>
                    <div className="relative bg-gradient-to-br from-blue-900/40 to-cyan-900/40 border border-blue-500/30 rounded-2xl p-5 hover:from-blue-900/60 hover:to-cyan-900/60 hover:border-blue-500/50 transition-all duration-300 group hover:shadow-lg hover:shadow-blue-500/20">
                      <div className="absolute top-0 right-0 w-20 h-20 bg-blue-500/10 rounded-full -mr-10 -mt-10 group-hover:bg-blue-500/20 transition-all"></div>
                      <div className="text-blue-400 text-xs font-bold mb-1">🎭</div>
                      <div className="text-gray-400 text-xs mb-1">Top Genre</div>
                      <div className="text-lg font-bold text-white truncate">{stats.mostRatedGenre}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
                      <div className="flex items-center gap-2 mb-4">
                        <span className="text-xs font-medium text-purple-400/60">05</span>
                        <h2 className="text-lg font-semibold">Rating Distribution</h2>
                      </div>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={ratingDist}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                          <XAxis dataKey="rating" stroke="#aaa" tick={{fontSize: 12}} />
                          <YAxis stroke="#aaa" tick={{fontSize: 12}} />
                          <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }} labelStyle={{ color: '#fff' }} />
                          <Bar dataKey="count" fill={ACCENT_COLOR} radius={[4, 4, 0, 0]}>
                            {ratingDist.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % 5]} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    {mostWatchedGenres.genres.length > 0 && (
                      <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
                        <div className="flex items-center gap-2 mb-4">
                          <span className="text-xs font-medium text-blue-400/60">06</span>
                          <h2 className="text-lg font-semibold">Most Watched Genres</h2>
                        </div>
                        <div className="mb-4 text-sm text-gray-300">
                          Total: <span className="text-blue-400 font-bold">{mostWatchedGenres.totalGenres}</span>
                          {mostWatchedGenres.topGenre && (
                            <span className="ml-3 text-blue-200">
                              {mostWatchedGenres.topGenre.count} {mostWatchedGenres.topGenre.genre} ({mostWatchedGenres.topGenre.percentage}%)
                            </span>
                          )}
                        </div>
                        <ResponsiveContainer width="100%" height={340}>
                          <BarChart data={mostWatchedGenres.genres} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                            <XAxis type="number" stroke="#aaa" tick={{fontSize: 11}} />
                            <YAxis type="category" dataKey="genre" width={120} stroke="#aaa" tick={{fontSize: 11}} />
                            <Tooltip
                              contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}
                              labelStyle={{ color: '#fff' }}
                              formatter={(v, name, props) => [`${v} films (${props.payload.percentage}%)`, 'Count']}
                            />
                            <Bar dataKey="count" fill={ACCENT_COLOR} radius={[0, 6, 6, 0]}>
                              {mostWatchedGenres.genres.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % 5]} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                </>
              )}

              {activeTab === 'preferences' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {genreAffinity.length > 0 && (
                    <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
                      <div className="flex items-center gap-2 mb-4">
                        <span className="text-xs font-medium text-pink-400/60">01</span>
                        <h2 className="text-lg font-semibold">Genre Affinity</h2>
                      </div>
                      <ResponsiveContainer width="100%" height={380}>
                        <BarChart data={genreAffinity} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                          <XAxis type="number" domain={[0, 10]} stroke="#aaa" tick={{fontSize: 11}} />
                          <YAxis type="category" dataKey="genre" width={120} stroke="#aaa" tick={{fontSize: 11}} />
                          <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }} labelStyle={{ color: '#fff' }} />
                          <Bar dataKey="avgRating" fill={ACCENT_COLOR} radius={[0, 6, 6, 0]}>
                            {genreAffinity.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % 5]} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {eraPreference.length > 0 && (
                    <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
                      <div className="flex items-center gap-2 mb-4">
                        <span className="text-xs font-medium text-green-400/60">02</span>
                        <h2 className="text-lg font-semibold">Era Preference</h2>
                      </div>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={eraPreference}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                          <XAxis dataKey="decade" stroke="#aaa" tick={{fontSize: 11}} />
                          <YAxis domain={[0, 10]} stroke="#aaa" tick={{fontSize: 11}} />
                          <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }} labelStyle={{ color: '#fff' }} />
                          <Bar dataKey="avgRating" fill={ACCENT_COLOR} radius={[4, 4, 0, 0]}>
                            {eraPreference.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % 5]} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5 lg:col-span-2">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-medium text-blue-400/60">03</span>
                      <h2 className="text-lg font-semibold">🌍 Country Preference</h2>
                    </div>
                    <p className="text-xs text-gray-400 mb-4">Films rated 8+ by country of origin</p>
                    <div className="relative" style={{ height: countryPreference.length > 10 ? '500px' : '360px' }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={countryPreference.length > 0 ? countryPreference : [{ country: 'No data yet', count: 0 }]}
                          layout="vertical"
                          margin={{ top: 10, right: 40, left: 160, bottom: 10 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                          <XAxis type="number" stroke="#aaa" domain={[0, 'dataMax + 10']} tick={{fontSize: 11}} />
                          <YAxis 
                            type="category" 
                            dataKey="country" 
                            stroke="#aaa" 
                            width={150}
                            tick={{ fontSize: 11 }}
                            interval={0}
                          />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}
                            labelStyle={{ color: '#fff' }}
                            formatter={(v) => [`${v} films rated ≥8`, 'Count']}
                          />
                          <Bar dataKey="count" fill={ACCENT_COLOR} radius={[0, 8, 8, 0]} minPointSize={10}>
                            {countryPreference.map((_, i) => (
                              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                            ))}
                            <LabelList dataKey="count" position="right" fill="#e5e7eb" fontSize={12} offset={8} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>

                      {countryPreference.length === 0 && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-xl">
                          <p className="text-gray-300 text-sm">No high-rated films with country data yet</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'discoveries' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {hiddenGems.allFilms?.length > 0 && (
                    <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-xs font-medium text-yellow-400/60">01</span>
                        <h2 className="text-lg font-semibold">Hidden Gems</h2>
                        <span className="text-xs text-gray-500">(You &gt; IMDb by &gt;2.5)</span>
                      </div>
                      <div className="mb-3 text-xs text-gray-400">
                        Showing {(hiddenGemsPage - 1) * hiddenGemsPerPage + 1}–{Math.min(hiddenGemsPage * hiddenGemsPerPage, hiddenGems.allFilms.length)} of {hiddenGems.allFilms.length}
                      </div>
                      <div className="space-y-3 mb-5">
                        {hiddenGems.allFilms.slice((hiddenGemsPage - 1) * hiddenGemsPerPage, hiddenGemsPage * hiddenGemsPerPage).map((movie, idx) => (
                          <div key={idx} className="flex items-center gap-3 p-3 bg-gray-850 rounded-lg">
                            {posters[`${movie.title}_${movie.year}`] ? (
                              <img 
                                src={posters[`${movie.title}_${movie.year}`]} 
                                alt={movie.title}
                                className="w-8 h-12 object-cover rounded flex-shrink-0"
                                onError={(e) => e.target.style.display = 'none'}
                              />
                            ) : (
                              <div 
                                className="w-8 h-12 bg-gray-700 rounded flex items-center justify-center cursor-pointer flex-shrink-0"
                                onClick={() => fetchPoster(movie.title, movie.year)}
                                title="Click to load poster"
                              >
                                <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <button 
                                onClick={() => handleMovieClick(movie)}
                                className="font-semibold text-sm text-blue-400 hover:text-blue-300 hover:underline text-left truncate block w-full"
                              >
                                {movie.title}
                              </button>
                              <div className="text-xs text-gray-400">({movie.year})</div>
                            </div>
                            <div className="flex gap-2 text-xs flex-shrink-0">
                              <div>You: <span className="text-green-400 font-bold">{movie.yourRating}</span></div>
                              <div>IMDb: <span className="text-gray-300 font-bold">{movie.imdbRating}</span></div>
                              <div className="text-blue-400 font-bold">+{movie.difference}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                      {hiddenGems.allFilms.length > hiddenGemsPerPage && (
                        <div className="flex justify-center gap-3">
                          <button
                            onClick={() => {
                              const newPage = Math.max(1, hiddenGemsPage - 1);
                              setHiddenGemsPage(newPage);
                              loadPostersForFilms(hiddenGems.allFilms.slice((newPage - 1) * hiddenGemsPerPage, newPage * hiddenGemsPerPage));
                            }}
                            disabled={hiddenGemsPage === 1}
                            className="px-4 py-1.5 bg-gray-800 rounded text-xs disabled:opacity-50 hover:bg-gray-700"
                          >Prev</button>
                          <span className="py-1.5 text-xs text-gray-400">Page {hiddenGemsPage}</span>
                          <button
                            onClick={() => {
                              const newPage = hiddenGemsPage + 1;
                              setHiddenGemsPage(newPage);
                              loadPostersForFilms(hiddenGems.allFilms.slice((newPage - 1) * hiddenGemsPerPage, newPage * hiddenGemsPerPage));
                            }}
                            disabled={hiddenGemsPage * hiddenGemsPerPage >= hiddenGems.allFilms.length}
                            className="px-4 py-1.5 bg-gray-800 rounded text-xs disabled:opacity-50 hover:bg-gray-700"
                          >Next</button>
                        </div>
                      )}
                    </div>
                  )}

                  {hiddenTreasures.allFilms?.length > 0 && (
                    <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-medium text-purple-400/60">02</span>
                        <h2 className="text-lg font-semibold">💎 Hidden Treasures</h2>
                      </div>
                      <p className="text-xs text-gray-400 mb-4">Your 8+ ratings on films with &lt; 2,000 IMDb votes</p>

                      {hiddenTreasures.stats && (
                        <div className="grid grid-cols-3 gap-3 mb-4 p-3 bg-gray-850 rounded-lg">
                          <div className="text-center">
                            <div className="text-gray-400 text-xs">Count</div>
                            <div className="text-lg font-bold text-blue-400">{hiddenTreasures.stats.count}</div>
                          </div>
                          <div className="text-center">
                            <div className="text-gray-400 text-xs">Your Avg</div>
                            <div className="text-lg font-bold text-green-400">{hiddenTreasures.stats.avgYourRating}</div>
                          </div>
                          <div className="text-center">
                            <div className="text-gray-400 text-xs">Avg Votes</div>
                            <div className="text-lg font-bold text-gray-300">{hiddenTreasures.stats.avgVoteCount.toLocaleString()}</div>
                          </div>
                        </div>
                      )}

                      <div className="mb-3 text-xs text-gray-400">
                        Showing {(hiddenTreasuresPage - 1) * itemsPerPage + 1}–{Math.min(hiddenTreasuresPage * itemsPerPage, hiddenTreasures.allFilms.length)} of {hiddenTreasures.allFilms.length}
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-gray-700 text-gray-300">
                              <th className="py-2 px-1 text-left font-semibold w-10"></th>
                              <th className="py-2 px-2 text-left font-semibold">Title</th>
                              <th className="py-2 px-2 text-center font-semibold">Year</th>
                              <th className="py-2 px-2 text-center font-semibold">You</th>
                              <th className="py-2 px-2 text-center font-semibold">IMDb</th>
                              <th className="py-2 px-2 text-center font-semibold">Votes</th>
                              <th className="py-2 px-2 text-center font-semibold">Diff</th>
                            </tr>
                          </thead>
                          <tbody>
                            {hiddenTreasures.allFilms.slice((hiddenTreasuresPage - 1) * itemsPerPage, hiddenTreasuresPage * itemsPerPage).map((m, i) => (
                              <tr key={i} className="border-b border-gray-800 hover:bg-gray-850">
                                <td className="py-2 px-1">
                                  {posters[`${m.title}_${m.year}`] ? (
                                    <img 
                                      src={posters[`${m.title}_${m.year}`]} 
                                      alt={m.title}
                                      className="w-6 h-9 object-cover rounded"
                                      onError={(e) => e.target.style.display = 'none'}
                                    />
                                  ) : (
                                    <div 
                                      className="w-6 h-9 bg-gray-700 rounded flex items-center justify-center cursor-pointer"
                                      onClick={() => fetchPoster(m.title, m.year)}
                                      title="Click to load poster"
                                    >
                                      <svg className="w-2 h-2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                      </svg>
                                    </div>
                                  )}
                                </td>
                                <td className="py-2 px-2 font-medium max-w-[150px] truncate">
                                  <button 
                                    onClick={() => handleMovieClick(m)}
                                    className="text-blue-400 hover:text-blue-300 hover:underline text-left w-full truncate"
                                  >
                                    {m.title}
                                  </button>
                                </td>
                                <td className="py-2 px-2 text-center text-gray-400">{m.year}</td>
                                <td className="py-2 px-2 text-center text-green-400 font-bold">{m.yourRating}</td>
                                <td className="py-2 px-2 text-center text-gray-300">{m.imdbRating}</td>
                                <td className="py-2 px-2 text-center text-gray-400">{(m.numVotes || 0).toLocaleString()}</td>
                                <td className="py-2 px-2 text-center">
                                  <span className={`font-bold ${m.difference >= 2 ? 'text-blue-400' : 'text-green-400'}`}>
                                    +{m.difference}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {hiddenTreasures.allFilms.length > itemsPerPage && (
                        <div className="flex justify-center gap-3 mt-5">
                          <button
                            onClick={() => {
                              const newPage = Math.max(1, hiddenTreasuresPage - 1);
                              setHiddenTreasuresPage(newPage);
                              loadPostersForFilms(hiddenTreasures.allFilms.slice((newPage - 1) * itemsPerPage, newPage * itemsPerPage));
                            }}
                            disabled={hiddenTreasuresPage === 1}
                            className="px-4 py-1.5 bg-gray-800 rounded text-xs disabled:opacity-50 hover:bg-gray-700"
                          >Prev</button>
                          <span className="py-1.5 text-xs text-gray-400">Page {hiddenTreasuresPage} / {Math.ceil(hiddenTreasures.allFilms.length / itemsPerPage)}</span>
                          <button
                            onClick={() => {
                              const newPage = hiddenTreasuresPage + 1;
                              setHiddenTreasuresPage(newPage);
                              loadPostersForFilms(hiddenTreasures.allFilms.slice((newPage - 1) * itemsPerPage, newPage * itemsPerPage));
                            }}
                            disabled={hiddenTreasuresPage * itemsPerPage >= hiddenTreasures.allFilms.length}
                            className="px-4 py-1.5 bg-gray-800 rounded text-xs disabled:opacity-50 hover:bg-gray-700"
                          >Next</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'deepdive' && (
                <div className="space-y-6">
                  {favoriteFilmPerYear.length > 0 && (() => {
                    const latest = selectedFavoriteYear || favoriteFilmPerYear[0].year;
                    const selected = favoriteFilmPerYear.find(y => y.year === latest) || favoriteFilmPerYear[0];
                    return (
                      <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-xs font-medium text-yellow-400/60">01</span>
                          <h2 className="text-lg font-semibold">⭐ Favorites by Year</h2>
                          <span className="text-xs text-gray-500">(9–10 rated)</span>
                        </div>
                        <div className="mb-4">
                          <label className="block text-gray-300 mb-1 text-xs">Select Year</label>
                          <select
                            value={latest}
                            onChange={e => {
                              setSelectedFavoriteYear(Number(e.target.value));
                              const sel = favoriteFilmPerYear.find(y => y.year === Number(e.target.value));
                              if (sel) loadPostersForFilms(sel.films);
                            }}
                            className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-white w-full sm:w-56 text-sm"
                          >
                            {favoriteFilmPerYear.map(y => (
                              <option key={y.year} value={y.year}>
                                {y.year} ({y.filmCount})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-3">
                          {selected.films.map((f, i) => (
                            <div key={i} className="flex items-center gap-3 p-3 bg-gray-850 rounded-lg">
                              {posters[`${f.title}_${f.year}`] ? (
                                <img 
                                  src={posters[`${f.title}_${f.year}`]} 
                                  alt={f.title}
                                  className="w-10 h-14 object-cover rounded flex-shrink-0"
                                  onError={(e) => e.target.style.display = 'none'}
                                />
                              ) : (
                                <div 
                                  className="w-10 h-14 bg-gray-700 rounded flex items-center justify-center cursor-pointer flex-shrink-0"
                                  onClick={() => fetchPoster(f.title, f.year)}
                                  title="Click to load poster"
                                >
                                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                  </svg>
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <button 
                                  onClick={() => handleMovieClick(f)}
                                  className="text-blue-400 hover:text-blue-300 hover:underline text-left font-semibold text-sm"
                                >
                                  {f.title}
                                </button>
                                <div className="text-xs text-gray-400">{f.year}</div>
                              </div>
                              <div className="flex gap-4 text-xs flex-shrink-0">
                                <span>You: <strong className="text-green-400">{f.yourRating}</strong></span>
                                <span>IMDb: <strong className="text-gray-300">{f.imdbRating}</strong></span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {personalCanon.length > 0 && (() => {
                    const selectedDec = expandedDecades[0] || personalCanon[personalCanon.length - 1].decade;
                    const selected = personalCanon.find(d => d.decade === selectedDec) || personalCanon[personalCanon.length - 1];
                    return (
                      <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-xs font-medium text-pink-400/60">02</span>
                          <h2 className="text-lg font-semibold">Personal Canon</h2>
                          <span className="text-xs text-gray-500">(by decade, 9–10)</span>
                        </div>
                        <div className="mb-4">
                          <label className="block text-gray-300 mb-1 text-xs">Select Decade</label>
                          <select
                            value={selectedDec}
                            onChange={e => {
                              setExpandedDecades([e.target.value]);
                              const sel = personalCanon.find(d => d.decade === e.target.value);
                              if (sel) loadPostersForFilms(sel.films);
                            }}
                            className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-white w-full sm:w-56 text-sm"
                          >
                            {personalCanon.map(d => (
                              <option key={d.decade} value={d.decade}>
                                {d.decade} ({d.filmCount})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-3">
                          {selected.films.map((f, i) => (
                            <div key={i} className="flex items-center gap-3 p-3 bg-gray-850 rounded-lg">
                              {posters[`${f.title}_${f.year}`] ? (
                                <img 
                                  src={posters[`${f.title}_${f.year}`]} 
                                  alt={f.title}
                                  className="w-10 h-14 object-cover rounded flex-shrink-0"
                                  onError={(e) => e.target.style.display = 'none'}
                                />
                              ) : (
                                <div 
                                  className="w-10 h-14 bg-gray-700 rounded flex items-center justify-center cursor-pointer flex-shrink-0"
                                  onClick={() => fetchPoster(f.title, f.year)}
                                  title="Click to load poster"
                                >
                                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                  </svg>
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <button 
                                  onClick={() => handleMovieClick(f)}
                                  className="text-blue-400 hover:text-blue-300 hover:underline text-left font-semibold text-sm"
                                >
                                  {f.title}
                                </button>
                                <div className="text-xs text-gray-400">{f.year}</div>
                              </div>
                              <div className="flex gap-4 text-xs flex-shrink-0">
                                <span>You: <strong className="text-green-400">{f.yourRating}</strong></span>
                                <span>IMDb: <strong className="text-gray-300">{f.imdbRating}</strong></span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {yearlyHighlight.length > 0 && (
                    <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
                      <div className="flex items-center gap-2 mb-4">
                        <span className="text-xs font-medium text-blue-400/60">03</span>
                        <h2 className="text-lg font-semibold">Yearly Rating Activity</h2>
                      </div>
                      <ResponsiveContainer width="100%" height={320}>
                        <BarChart data={yearlyHighlight}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                          <XAxis dataKey="year" stroke="#aaa" interval="preserveStartEnd" tick={{fontSize: 11}} />
                          <YAxis stroke="#aaa" tick={{fontSize: 11}} />
                          <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }} labelStyle={{ color: '#fff' }} />
                          <Bar dataKey="filmCount" fill={ACCENT_COLOR} radius={[4, 4, 0, 0]}>
                            {yearlyHighlight.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % 5]} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {topFilmPerGenre.length > 0 && (
                    <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-xs font-medium text-green-400/60">04</span>
                        <h2 className="text-lg font-semibold">Top Films by Genre</h2>
                      </div>
                      <p className="text-gray-400 mb-4 text-xs">Top 10 genres — highest rated films (no duplicates)</p>
                      <div className="space-y-3">
                        {topFilmPerGenre.map((g, idx) => (
                          <div key={idx} className="border border-gray-700 rounded-lg overflow-hidden">
                            <button
                              onClick={() => {
                                const newExpanded = { ...expandedGenres, [g.genre]: !expandedGenres[g.genre] };
                                setExpandedGenres(newExpanded);
                                if (!expandedGenres[g.genre]) {
                                  loadPostersForFilms(g.films);
                                }
                              }}
                              className="w-full flex items-center justify-between p-3 bg-gray-850 hover:bg-gray-800 transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                <span className="text-base font-bold text-blue-400">{g.genre}</span>
                                <span className="text-gray-400 text-xs">
                                  ({g.films.length} • avg {g.avgGenreRating.toFixed(2)})
                                </span>
                              </div>
                              <svg className={`w-4 h-4 text-gray-400 transition-transform ${expandedGenres[g.genre] ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                            {expandedGenres[g.genre] && (
                              <div className="p-3 bg-gray-900 max-h-72 overflow-y-auto space-y-2">
                                {g.films.map((f, fi) => (
                                  <div key={fi} className="flex items-center gap-3 p-2 bg-gray-850 rounded-lg">
                                    {posters[`${f.title}_${f.year}`] ? (
                                      <img 
                                        src={posters[`${f.title}_${f.year}`]} 
                                        alt={f.title}
                                        className="w-8 h-12 object-cover rounded flex-shrink-0"
                                        onError={(e) => e.target.style.display = 'none'}
                                      />
                                    ) : (
                                      <div 
                                        className="w-8 h-12 bg-gray-700 rounded flex items-center justify-center cursor-pointer flex-shrink-0"
                                        onClick={() => fetchPoster(f.title, f.year)}
                                        title="Click to load poster"
                                      >
                                        <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                        </svg>
                                      </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                      <button 
                                        onClick={() => handleMovieClick(f)}
                                        className="font-medium text-blue-400 hover:text-blue-300 hover:underline text-left text-sm"
                                      >
                                        {f.title}
                                      </button>
                                      <div className="text-xs text-gray-400">{f.year}</div>
                                    </div>
                                    <div className="flex gap-3 text-xs flex-shrink-0">
                                      <span>You: <strong className="text-green-400">{f.yourRating}</strong></span>
                                      <span>IMDb: <strong className="text-gray-300">{f.imdbRating}</strong></span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {consistentlyLovedDirectors.length > 0 && (
                    <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
                      <div className="flex items-center gap-2 mb-4">
                        <span className="text-xs font-medium text-purple-400/60">05</span>
                        <h2 className="text-lg font-semibold">Most Consistently Loved Directors</h2>
                      </div>
                      <ResponsiveContainer width="100%" height={380}>
                        <BarChart data={consistentlyLovedDirectors} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                          <XAxis type="number" stroke="#aaa" tick={{fontSize: 11}} />
                          <YAxis type="category" dataKey="director" width={140} stroke="#aaa" tick={{fontSize: 11}} />
                          <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }} labelStyle={{ color: '#fff' }} />
                          <Bar dataKey="highRatedCount" fill={ACCENT_COLOR} radius={[0, 6, 6, 0]}>
                            {consistentlyLovedDirectors.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % 5]} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : null}
        
        {(!fetchingCountries && !data) && (
          <div className="text-center py-24">
            <div className="text-8xl mb-8">🎬</div>
            <h3 className="text-3xl font-semibold mb-6 text-gray-100">Ready to analyze your taste?</h3>
            <p className="text-xl text-gray-300 mb-8">Upload your IMDb ratings export file to begin</p>
            <p className="text-gray-500">
              Get the file here →{' '}
              <a
                href="https://www.imdb.com/list/ratings"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:underline"
              >
                imdb.com → Ratings → Export
              </a>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
