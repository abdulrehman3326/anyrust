import type { ReactNode } from 'react';
import { cn } from '../lib';

/** Every view uses the same frame: width, padding and vertical rhythm. */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 md:px-8 md:py-10', className)}>{children}</div>;
}

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Shown above the title, e.g. a status badge. */
  eyebrow?: ReactNode;
  /** Page-level buttons. This is the only place they go. */
  actions?: ReactNode;
}

export function PageHeader({ title, description, eyebrow, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-4 border-b border-border/80 pb-8 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0 space-y-2">
        {eyebrow && <div className="flex items-center gap-2">{eyebrow}</div>}
        <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
        {description && <p className="max-w-2xl text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 md:shrink-0">{actions}</div>}
    </header>
  );
}

interface SectionHeaderProps {
  id?: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}

export function SectionHeader({ id, title, description, action }: SectionHeaderProps) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div className="min-w-0 space-y-1">
        <h2 id={id} className="font-display text-lg font-semibold tracking-tight">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}
