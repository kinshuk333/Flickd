import React from 'react';
import { Card, CardContent } from './ui';

const buildSegments = (percent) => {
  const filled = Math.round((Math.max(0, Math.min(100, percent)) / 100) * 12);
  return Array.from({ length: 12 }, (_, index) => index < filled);
};

export default function TasteAtlasCard({ result }) {
  const percent = Number(result?.percent) || 0;
  const segments = buildSegments(percent);

  return (
    <Card className="h-full border-slate-700/70 bg-[linear-gradient(180deg,rgba(15,23,42,.92),rgba(8,13,24,.96))] shadow-none">
      <CardContent className="flex h-full flex-col gap-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{result?.category}</p>
            <h3 className="mt-1 text-base font-semibold leading-tight text-slate-100">{result?.name}</h3>
          </div>
          <div className="text-right">
            <div className="text-2xl font-semibold tracking-tight text-slate-50">{percent}%</div>
            <div className="text-[11px] text-slate-400">{result?.watched} / {result?.total}</div>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-1" aria-hidden="true">
          {segments.map((filled, index) => (
            <span
              key={`${result?.id}_segment_${index}`}
              className={`h-1.5 rounded-full ${filled ? 'bg-slate-200' : 'bg-slate-700/80'}`}
            />
          ))}
        </div>

        <p className="text-sm leading-relaxed text-slate-300">{result?.insight}</p>
        <p className="mt-auto text-xs leading-relaxed text-slate-500">{result?.description}</p>
      </CardContent>
    </Card>
  );
}
