import type { ReactNode } from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '../lib';

/** shadcn/ui badge, extended with soft status tones. */
export const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium transition-[color,box-shadow] [&>svg]:pointer-events-none [&>svg]:size-3',
  {
    variants: {
      tone: {
        neutral: 'border-transparent bg-secondary text-secondary-foreground',
        outline: 'text-foreground',
        brand: 'border-brand/25 bg-brand/10 text-brand',
        success: 'border-success/25 bg-success/10 text-success',
        warning: 'border-warning/25 bg-warning/10 text-warning',
        danger: 'border-destructive/25 bg-destructive/10 text-destructive',
        info: 'border-info/25 bg-info/10 text-info',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export type BadgeTone = 'neutral' | 'outline' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

interface BadgeProps {
  tone?: BadgeTone;
  dot?: boolean;
  pulse?: boolean;
  className?: string;
  children: ReactNode;
}

export function Badge({ tone = 'neutral', dot, pulse, className, children }: BadgeProps) {
  return (
    <span data-slot="badge" className={cn(badgeVariants({ tone }), className)}>
      {dot && <span className={cn('size-1.5 rounded-full bg-current', pulse && 'animate-pulse')} aria-hidden="true" />}
      {children}
    </span>
  );
}
