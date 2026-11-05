import { useTheme } from '@/shared/theme';
import type { ThemeName } from '@/shared/theme';
import { Button, Icon } from '@/shared/ui';
import type { IconName } from '@/shared/ui';

const icons: Record<ThemeName, IconName> = { light: 'sun', dark: 'moon' };
const labels: Record<ThemeName, string> = { light: 'Light theme', dark: 'Dark theme' };

/** Switches between dark and light. */
export function ThemeToggle() {
  const { theme, setMode } = useTheme();
  const next: ThemeName = theme === 'dark' ? 'light' : 'dark';
  return (
    <Button variant="ghost" iconOnly aria-label={`${labels[theme]}. Switch to ${labels[next].toLowerCase()}`} title={labels[theme]} onClick={() => setMode(next)}>
      <Icon name={icons[theme]} />
    </Button>
  );
}
