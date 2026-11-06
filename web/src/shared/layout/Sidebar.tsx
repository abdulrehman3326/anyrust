import { cn } from '../lib';
import { Icon, buttonVariants } from '../ui';
import type { IconName } from '../ui';

export interface NavEntry {
  id: string;
  label: string;
  icon: IconName;
  href: string;
  /** Shows a live indicator next to the label. */
  live?: boolean;
}

interface SidebarProps {
  items: NavEntry[];
  footerItems: NavEntry[];
  activeId: string;
  open: boolean;
  onClose: () => void;
}

function NavLink({ item, active, onClose }: { item: NavEntry; active: boolean; onClose: () => void }) {
  return (
    <a
      href={item.href}
      aria-current={active ? 'page' : undefined}
      onClick={onClose}
      className={cn(
        buttonVariants({ variant: 'ghost' }),
        'w-full justify-start gap-3 px-3 text-muted-foreground has-[>svg]:px-3',
        active && 'bg-sidebar-accent font-medium text-sidebar-accent-foreground dark:bg-sidebar-accent',
      )}
    >
      <Icon name={item.icon} />
      <span className="flex-1">{item.label}</span>
      {item.live && (
        <span className="flex items-center gap-1.5 text-xs font-medium text-brand">
          <span className="size-1.5 animate-pulse rounded-full bg-brand" aria-hidden="true" />
          Live
        </span>
      )}
    </a>
  );
}

export function Sidebar({ items, footerItems, activeId, open, onClose }: SidebarProps) {
  return (
    <>
      <button
        type="button"
        className={cn('fixed inset-0 z-30 bg-black/60 lg:hidden', open ? 'block' : 'hidden')}
        aria-label="Close navigation"
        onClick={onClose}
        tabIndex={-1}
      />
      <aside
        data-open={open}
        aria-label="Main navigation"
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-60 flex-col gap-6 border-r border-sidebar-border bg-sidebar px-3 py-4 text-sidebar-foreground transition-transform duration-300 ease-out lg:z-20 lg:translate-x-0 lg:shadow-none',
          open ? 'translate-x-0 shadow-xl' : '-translate-x-full',
        )}
      >
        <a className="flex h-9 items-center gap-2.5 px-2 font-display text-base font-semibold tracking-tight" href="#/" aria-label="Deskstream home" onClick={onClose}>
          <span className="flex size-7 items-center justify-center rounded-md bg-brand text-sm font-bold text-brand-foreground" aria-hidden="true">d</span>
          <span>deskstream<span className="text-brand">.</span></span>
        </a>

        <nav className="flex flex-col gap-1" aria-label="Workspace">
          <div className="px-3 pb-1 text-xs font-medium text-muted-foreground">Workspace</div>
          {items.map((item) => (
            <NavLink key={item.id} item={item} active={item.id === activeId} onClose={onClose} />
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-4">
          <nav className="flex flex-col gap-1" aria-label="Support">
            {footerItems.map((item) => (
              <NavLink key={item.id} item={item} active={item.id === activeId} onClose={onClose} />
            ))}
          </nav>
          <div className="rounded-xl border border-border/80 dark:border-transparent bg-card p-4 text-sm shadow-xs">
            <strong className="flex items-center gap-2 font-medium">
              <Icon name="shield" size={16} className="text-success" />
              Permission-based
            </strong>
            <p className="mt-1.5 text-muted-foreground">Nothing is shared until you choose a source and approve the viewer.</p>
          </div>
        </div>
      </aside>
    </>
  );
}
