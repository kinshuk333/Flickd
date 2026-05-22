import React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '../../lib/utils';

export const Tabs = TabsPrimitive.Root;

export const TabsList = React.forwardRef(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      'inline-flex h-auto flex-wrap items-center gap-2 rounded-2xl border border-slate-700/70 bg-slate-950/70 p-2',
      className
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

export const TabsTrigger = React.forwardRef(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'inline-flex h-10 items-center justify-center whitespace-nowrap rounded-xl border border-slate-700 bg-slate-900/80 px-4 text-sm font-medium normal-case tracking-normal text-slate-300 transition-all data-[state=active]:border-blue-400/70 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-[0_10px_24px_rgba(37,99,235,.35)] hover:text-white',
      className
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

export const TabsContent = React.forwardRef(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn('mt-4 focus-visible:outline-none', className)}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;
