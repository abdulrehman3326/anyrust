import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { applyTheme } from './applyTheme';
import { readStoredMode, resolveTheme } from './ThemeProvider';

describe('theme', () => {
  it('toggles the shadcn .dark class and color-scheme', () => {
    const root = document.createElement('html');
    applyTheme('dark', root);
    expect(root.classList.contains('dark')).toBe(true);
    expect(root.style.colorScheme).toBe('dark');
    applyTheme('light', root);
    expect(root.classList.contains('dark')).toBe(false);
    expect(root.dataset.theme).toBe('light');
  });

  it('defaults to dark and resolves system mode', () => {
    localStorage.clear();
    expect(readStoredMode()).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('system', true)).toBe('dark');
  });

  it('keeps color literals out of every file except globals.css', () => {
    const root = join(__dirname, '..', '..');
    const literal = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|hsl)a?\(|\boklch\(/;
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(css|tsx?)$/.test(entry) && entry !== 'globals.css' && entry !== 'theme.test.ts') {
          if (literal.test(readFileSync(path, 'utf8'))) offenders.push(path);
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});
