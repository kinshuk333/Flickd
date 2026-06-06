import React from 'react';
import { Card, CardContent } from './ui';

export default function CinemaBlindSpots({ results = [] }) {
  const blindSpots = [...results]
    .sort((a, b) => (Number(a?.percent) || 0) - (Number(b?.percent) || 0))
    .slice(0, 3);

  if (!blindSpots.length) return null;

  return (
    <Card className="border-slate-700/70 bg-[linear-gradient(180deg,rgba(12,18,31,.96),rgba(7,12,22,.98))] shadow-none">
      <CardContent className="p-5">
        <div className="flex flex-col gap-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Next Territories</p>
          <h3 className="text-lg font-semibold text-slate-100">Your Cinema Blind Spots</h3>
          <p className="text-sm leading-relaxed text-slate-400">
            These are the film territories where your watch history has the most room to expand.
          </p>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {blindSpots.map((spot) => {
            const suggestions = (spot?.missingFilms || []).slice(0, 3);
            return (
              <div key={`blind_${spot?.id}`} className="rounded-xl border border-slate-700/70 bg-slate-950/45 p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <h4 className="text-sm font-semibold text-slate-100">{spot?.name}</h4>
                  <span className="text-sm font-semibold text-slate-300">{spot?.percent}%</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">{spot?.watched} / {spot?.total} watched</p>
                {suggestions.length > 0 && (
                  <p className="mt-3 text-xs leading-relaxed text-slate-400">
                    Suggested next films: <span className="text-slate-200">{suggestions.map((film) => film.title).join(', ')}</span>
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
