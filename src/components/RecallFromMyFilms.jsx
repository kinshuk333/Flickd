import React, { useMemo, useState } from 'react';
import { Search, Star, UserRound, Clapperboard, BadgeCheck } from 'lucide-react';
import { searchRecallFilms } from '../utils/recallSearch';

const EXAMPLE_QUERIES = [
  'lonely taxi driver',
  'rich family basement',
  'dreams inside dreams',
  'space computer',
];

const posterKey = (movie = {}) => `${movie.title || ''}_${movie.year || ''}`;

const cleanMeta = (value) => String(value || '').trim();

const formatGenre = (genre) => cleanMeta(genre).replace(/\s*,\s*/g, ' / ');

export default function RecallFromMyFilms({
  userMovies = [],
  posters = {},
  onMovieClick,
}) {
  const [query, setQuery] = useState('');
  const results = useMemo(() => searchRecallFilms(userMovies, query), [userMovies, query]);
  const hasMovies = Array.isArray(userMovies) && userMovies.length > 0;
  const hasQuery = query.trim().length > 0;

  const stateMessage = !hasMovies
    ? 'Upload your ratings to use Recall from My Films.'
    : !hasQuery
      ? 'Type a memory fragment to search your watched films.'
      : results.length === 0
        ? 'No strong memory match found. Try adding a person, place, scene, mood, country, or year.'
        : '';

  return (
    <section className="rounded-2xl border border-blue-500/20 bg-[#111827] p-4 sm:p-5">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-blue-400/20 bg-blue-500/10 px-3 py-1 text-xs text-blue-200">
            <BadgeCheck className="h-3.5 w-3.5" />
            Local memory search
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-white">Recall from My Films</h1>
            <p className="mt-2 max-w-3xl text-sm text-gray-300">
              Search your watched films by faint memories, moods, plots, people, places, or fragments.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-gray-800 bg-[#0b1220] p-3 sm:p-4">
          <label className="sr-only" htmlFor="recall-search">
            Describe what you remember
          </label>
          <div className="flex items-center gap-3 rounded-xl border border-gray-700 bg-[#050b17] px-3">
            <Search className="h-4 w-4 flex-none text-blue-300" />
            <input
              id="recall-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Describe what you remember..."
              className="h-11 min-w-0 flex-1 border-0 bg-transparent px-0 text-sm text-white outline-none placeholder:text-gray-500 focus:ring-0"
            />
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {EXAMPLE_QUERIES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setQuery(example)}
                className="rounded-full border border-gray-700 bg-[#101827] px-3 py-1.5 text-xs text-gray-300 hover:border-blue-400/40 hover:text-white"
              >
                {example}
              </button>
            ))}
          </div>
        </div>

        {stateMessage ? (
          <div className="rounded-xl border border-gray-800 bg-[#0b1220] px-4 py-8 text-center text-sm text-gray-300">
            {stateMessage}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {results.map((movie) => {
              const poster = movie.poster || posters[posterKey(movie)] || posters[posterKey(movie.source)];
              const title = cleanMeta(movie.title) || 'Untitled film';
              const year = cleanMeta(movie.year);
              const director = cleanMeta(movie.director);
              const genre = formatGenre(movie.genre);
              const rating = cleanMeta(movie.userRating);

              return (
                <article
                  key={`${movie.imdbId || title}-${year}-${movie.index}`}
                  className="grid grid-cols-[82px_minmax(0,1fr)] gap-3 rounded-xl border border-gray-800 bg-[#0b1220] p-3 sm:grid-cols-[104px_minmax(0,1fr)]"
                >
                  <button
                    type="button"
                    onClick={() => onMovieClick?.(movie.source || movie)}
                    className="min-h-0 overflow-hidden rounded-lg border border-gray-800 bg-[#111827] p-0"
                    aria-label={`View details for ${title}`}
                  >
                    {poster ? (
                      <img
                        src={poster}
                        alt={title}
                        className="aspect-[2/3] h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex aspect-[2/3] h-full w-full items-center justify-center text-gray-500">
                        <Clapperboard className="h-6 w-6" />
                      </div>
                    )}
                  </button>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => onMovieClick?.(movie.source || movie)}
                        className="min-h-0 p-0 text-left text-base font-semibold leading-tight text-white hover:text-blue-200"
                      >
                        {title}
                      </button>
                      <span className="rounded-full border border-blue-400/25 bg-blue-500/10 px-2.5 py-1 text-xs text-blue-100">
                        Memory match: {movie.confidence}%
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-400">
                      {year ? <span>{year}</span> : null}
                      {director ? (
                        <span className="inline-flex items-center gap-1">
                          <UserRound className="h-3.5 w-3.5" />
                          Directed by {director}
                        </span>
                      ) : null}
                      {rating ? (
                        <span className="inline-flex items-center gap-1 text-amber-200">
                          <Star className="h-3.5 w-3.5 fill-current" />
                          Your rating: {rating}/10
                        </span>
                      ) : null}
                    </div>

                    {genre ? <p className="mt-2 text-xs text-gray-300">{genre}</p> : null}
                    <p className="mt-3 text-xs text-gray-400">{movie.whyMatched}</p>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
