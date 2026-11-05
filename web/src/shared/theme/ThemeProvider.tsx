import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { applyTheme } from './applyTheme';
import type { ThemeName } from './applyTheme';

export type ThemeMode = ThemeName | 'system';

const STORAGE_KEY = 'deskstream-theme';
/** Dark is the default look; people can still pick light or follow the system. */
const DEFAULT_MODE: ThemeMode = 'dark';

interface ThemeContextValue {
  mode: ThemeMode;
  theme: ThemeName;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function readStoredMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    /* Storage can be unavailable; fall back to the default. */
  }
  return DEFAULT_MODE;
}

const systemQuery = () => window.matchMedia?.('(prefers-color-scheme: dark)');

export function resolveTheme(mode: ThemeMode, systemDark: boolean): ThemeName {
  if (mode === 'system') return systemDark ? 'dark' : 'light';
  return mode;
}

/** Applies the stored theme before React renders, so there is no flash of the wrong theme. */
export function initTheme(): void {
  applyTheme(resolveTheme(readStoredMode(), systemQuery()?.matches ?? false));
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readStoredMode);
  const [systemDark, setSystemDark] = useState(() => systemQuery()?.matches ?? false);

  useEffect(() => {
    const query = systemQuery();
    if (!query) return;
    const listener = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
  }, []);

  const theme = resolveTheme(mode, systemDark);
  useEffect(() => applyTheme(theme), [theme]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* The choice still applies for this visit. */
    }
  }, []);

  const value = useMemo(() => ({ mode, theme, setMode }), [mode, theme, setMode]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside ThemeProvider');
  return value;
}
