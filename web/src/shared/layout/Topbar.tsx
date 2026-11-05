import type { ReactNode } from 'react';
import { cn } from '../lib';
import { Button, Icon } from '../ui';

export type ServiceStatus = 'checking' | 'ready' | 'offline';

const serviceLabels: Record<ServiceStatus, string> = {
  checking: 'Connecting to service',
  ready: 'Service online',
  offline: 'Service unavailable',
};

const serviceDot: Record<ServiceStatus, string> = {
  checking: 'bg-muted-foreground animate-pulse',
  ready: 'bg-success',
  offline: 'bg-destructive',
};

interface TopbarProps {
  section: string;
  service: ServiceStatus;
  onMenu: () => void;
  /** Extra controls such as the theme toggle. */
  actions?: ReactNode;
}

export function Topbar({ section, service, onMenu, actions }: TopbarProps) {
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between gap-3 border-b bg-background/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:px-8">
      <div className="flex min-w-0 items-center gap-2">
        <Button className="-ml-2 lg:hidden" variant="ghost" iconOnly aria-label="Open navigation" onClick={onMenu}>
          <Icon name="menu" />
        </Button>
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <span className="hidden sm:inline">Deskstream</span>
          <Icon name="chevron" size={14} className="hidden sm:block" />
          <strong className="font-medium text-foreground">{section}</strong>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span
          className="inline-flex h-7 items-center gap-2 rounded-full border px-3 text-xs text-muted-foreground"
          data-status={service}
          role="status"
        >
          <span className={cn('size-2 rounded-full', serviceDot[service])} aria-hidden="true" />
          <span className="hidden sm:inline">{serviceLabels[service]}</span>
          <span className="sr-only sm:hidden">{serviceLabels[service]}</span>
        </span>
        {actions}
      </div>
    </header>
  );
}
