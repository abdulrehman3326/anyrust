export type ThemeName = 'light' | 'dark';

/**
 * Switches between the light (:root) and dark (.dark) token sets in globals.css.
 * Uses classList/CSSOM only, which the server's `style-src 'self'` policy allows.
 */
export function applyTheme(name: ThemeName, root: HTMLElement = document.documentElement): void {
  root.classList.toggle('dark', name === 'dark');
  root.dataset.theme = name;
  root.style.colorScheme = name;
}
