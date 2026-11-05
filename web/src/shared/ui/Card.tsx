import type { ComponentProps, HTMLAttributes } from 'react';
import { cn } from '../lib';

interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: 'section' | 'article' | 'div' | 'aside';
  /** Vertical padding for header/content/footer children. Turn off for edge-to-edge lists. */
  padded?: boolean;
}

/** shadcn/ui card. Children (CardHeader/CardContent/CardFooter) supply the horizontal padding. */
export function Card({ as: Tag = 'div', padded = true, className, ...rest }: CardProps) {
  return (
    <Tag
      data-slot="card"
      className={cn(
        'flex flex-col gap-6 rounded-xl border bg-card text-card-foreground shadow-sm',
        padded && 'py-6',
        className,
      )}
      {...rest}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        '@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6',
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: ComponentProps<'h2'>) {
  return <h2 data-slot="card-title" className={cn('font-display text-base font-semibold leading-tight tracking-tight', className)} {...props} />;
}

export function CardDescription({ className, ...props }: ComponentProps<'p'>) {
  return <p data-slot="card-description" className={cn('text-sm text-muted-foreground', className)} {...props} />;
}

export function CardAction({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-action"
      className={cn('col-start-2 row-span-2 row-start-1 self-start justify-self-end', className)}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn('px-6', className)} {...props} />;
}

export function CardFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="card-footer" className={cn('flex items-center px-6 [.border-t]:pt-6', className)} {...props} />;
}
