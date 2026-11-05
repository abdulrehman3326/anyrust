# Theme and dark mode

Source of truth: `web/src/shared/styles/globals.css`. Read it for values; this file records the roles and the rules that the CSS cannot state.

## How the theme switches

- Light tokens sit on `:root`; dark tokens override them on `.dark`. The `dark:` variant is `&:is(.dark *)`, so it follows the class on `<html>`, never `prefers-color-scheme` directly.
- `applyTheme()` (`shared/theme/applyTheme.ts`) toggles `.dark`, sets `data-theme`, and sets `color-scheme` so native controls (scrollbars, `<select>`, `<dialog>`) match.
- `initTheme()` runs in `main.tsx` before React renders, which prevents a flash of the wrong theme. `web/index.html` also ships `class="dark"` on `<html>` for the same reason. Keep both.
- `ThemeProvider` holds the mode (`'dark' | 'light' | 'system'`), persists it under the `localStorage` key `deskstream-theme` (wrapped in try/catch), and follows the OS when mode is `system`. **The default mode is `dark`.** Read it with `useTheme()`; the topbar `ThemeToggle` switches dark ↔ light.

## Token roles

Pick by role, not by how it looks today. Each role has a `-foreground` partner for text placed on it.

| Token | Role |
|---|---|
| `background` / `foreground` | Page canvas and default text |
| `card` | Raised surfaces (`Card`). In dark mode it sits one step lighter than `background`; that step is the elevation, so keep cards on `background`. |
| `popover` | Floating surfaces: menus, toasts |
| `primary` | The single main action. Inverts per theme (near-black in light, near-white in dark). |
| `secondary`, `muted`, `accent` | Neutral fills: quiet badges, hover backgrounds, chips |
| `muted-foreground` | Secondary text: descriptions, hints, captions |
| `border`, `input`, `ring` | Hairlines, field borders, focus rings. In dark they are white at 10–15% alpha. |
| `sidebar*` | The left navigation rail only |
| `destructive` | Errors and the End session action |
| `brand` | Deskstream red. Scarce: see "Design voice" in SKILL.md. |
| `success`, `warning`, `info` | Status. Use as tints: `bg-x/10 border-x/25 text-x`. |
| `stage` / `stage-foreground` | The video area. **Dark in both themes**, because shared screens are judged against black. Content over video uses `stage-foreground` with alpha (`/70`, `/50`, `/10`). |
| `chat-own` | The local user's chat bubble (aliases `brand`) |
| `sample-*` | Fixed palette for the sample-stream canvas, read at runtime by `features/session/lib/sampleStream.ts`. Identical in both themes, because it simulates a captured app. |

## Dark-mode rules

- Write the light-and-dark result with one token utility. Reach for a `dark:` override only when the *treatment* differs, not the color: e.g. the outline button uses `dark:bg-input/30` because dark surfaces need a translucent fill where light uses a solid one. Existing examples live in `shared/ui/Button.tsx` and `shared/layout/Sidebar.tsx`.
- Alpha tints (`bg-brand/10`, `border-success/25`) work in both themes because the token itself changes; this is the default way to make a soft status surface.
- Dark status tokens are lighter and slightly less saturated than light ones so text stays legible on dark surfaces. Preserve that when adding tones.
- Shadows barely register on dark. Separate dark surfaces with `border` and the `background` → `card` step instead.
- `bg-black/60` is used only for the dialog backdrop (a scrim, not a theme color).

## Adding a color

1. Add `--name` (and `--name-foreground` if text sits on it) to `:root` **and** `.dark` in `globals.css`, in `oklch()`.
2. Map it in `@theme inline` as `--color-name: var(--name);` so `bg-name`, `text-name`, `border-name/20` exist.
3. Use only the utility in components. For canvas or other JS that needs the value, read it with `getComputedStyle(document.documentElement).getPropertyValue('--name')`, as `sampleStream.ts` does.
4. Check it in both themes.
