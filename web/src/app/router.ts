import { useCallback, useEffect, useState } from 'react';

/**
 * Path routing with the History API: views live at clean URLs (`/join`, `/session`, …) and the server
 * answers each of them with the app shell. Invite links keep their secret in the URL fragment
 * (`/#join=<id>:<token>`) so it is never sent to the server; the session engine reads it once, and
 * navigating to the session view replaces it in the address bar.
 */
export const views = ['home', 'join', 'session', 'history', 'help'] as const;
export type View = (typeof views)[number];

export const viewTitles: Record<View, string> = {
  home: 'Home',
  join: 'Join session',
  session: 'Live session',
  history: 'History',
  help: 'How it works',
};

export const hrefFor = (view: View) => (view === 'home' ? '/' : `/${view}`);

/** Resolves a location to a view. Legacy `#/join` hashes are still understood. */
export function parseLocation(pathname: string, hash = ''): View {
  if (hash.startsWith('#join=')) return 'session';
  const fromHash = hash.startsWith('#/') ? hash.slice(2) : '';
  const name = (fromHash || pathname).replace(/^\/+|\/+$/g, '');
  return (views as readonly string[]).includes(name) ? (name as View) : 'home';
}

const viewForPath = (pathname: string): View | null => {
  const name = pathname.replace(/^\/+|\/+$/g, '');
  if (name === '') return 'home';
  return (views as readonly string[]).includes(name) ? (name as View) : null;
};

export function useRoute(): [View, (view: View) => void] {
  const [view, setView] = useState<View>(() => parseLocation(window.location.pathname, window.location.hash));

  const go = useCallback((next: View, mode: 'push' | 'replace') => {
    const target = hrefFor(next);
    const same = window.location.pathname === target && !window.location.hash;
    if (!same) window.history[mode === 'push' ? 'pushState' : 'replaceState'](null, '', target);
    setView(next);
    if (!same) window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    // Tidy legacy `#/view` URLs into clean paths.
    if (window.location.hash.startsWith('#/')) go(parseLocation('', window.location.hash), 'replace');

    const onPop = () => {
      setView(parseLocation(window.location.pathname, window.location.hash));
      window.scrollTo({ top: 0 });
    };
    // Turn in-app links into client-side navigation.
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor || anchor.target || anchor.hasAttribute('download') || anchor.origin !== window.location.origin || anchor.hash) return;
      const next = viewForPath(anchor.pathname);
      if (!next) return;
      event.preventDefault();
      go(next, 'push');
    };
    window.addEventListener('popstate', onPop);
    document.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('popstate', onPop);
      document.removeEventListener('click', onClick);
    };
  }, [go]);

  const navigate = useCallback((next: View) => go(next, window.location.hash ? 'replace' : 'push'), [go]);

  return [view, navigate];
}
