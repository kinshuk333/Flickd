import React from 'react';
import { cn } from '../../lib/utils';

export function Card({ className, ...props }) {
  return (
    <section
      className={cn(
        'rounded-2xl border border-slate-700/80 bg-[linear-gradient(180deg,rgba(11,21,43,.98),rgba(8,15,31,.98))] shadow-[0_18px_38px_rgba(2,6,17,.45)]',
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }) {
  return <div className={cn('flex flex-col space-y-1.5 p-5', className)} {...props} />;
}

export function CardTitle({ className, ...props }) {
  return <h3 className={cn('text-lg font-semibold leading-tight tracking-tight normal-case text-slate-50', className)} {...props} />;
}

export function CardDescription({ className, ...props }) {
  return <p className={cn('text-sm md:text-base leading-relaxed text-slate-300', className)} {...props} />;
}

export function CardContent({ className, ...props }) {
  return <div className={cn('p-5 pt-0', className)} {...props} />;
}
