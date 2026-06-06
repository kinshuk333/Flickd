import React from 'react';
import { Compass } from 'lucide-react';
import TasteAtlasCard from './TasteAtlasCard';
import CinemaBlindSpots from './CinemaBlindSpots';
import { tasteAtlasLists } from '../data/tasteAtlas';
import { calculateTasteAtlas } from '../utils/tasteAtlas';

export default function TasteAtlasSection({ userMovies = [] }) {
  const hasMovies = Array.isArray(userMovies) && userMovies.length > 0;
  const results = React.useMemo(
    () => calculateTasteAtlas(userMovies, tasteAtlasLists),
    [userMovies]
  );

  return (
    <section className="space-y-4">
      <div className="flickd-overview-section-heading">
        <div>
          <span className="inline-flex items-center gap-2">
            <Compass className="h-4 w-4 text-slate-400" />
            Canon Coverage
          </span>
          <h2>Taste Atlas</h2>
        </div>
        <p>See which parts of cinema history you have already travelled through - and which territories are still unexplored.</p>
      </div>

      {!hasMovies ? (
        <div className="rounded-xl border border-slate-700/70 bg-slate-950/50 p-5 text-sm text-slate-400">
          Upload your ratings to generate your Taste Atlas.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {results.map((result) => (
              <TasteAtlasCard key={result.id} result={result} />
            ))}
          </div>
          <CinemaBlindSpots results={results} />
        </>
      )}
    </section>
  );
}
