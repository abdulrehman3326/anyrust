---
name: deskstream-ui
description: Deskstream frontend design system and architecture (web/). Use before any change under web/src: adding or restyling a view, component, color, dark-mode behavior, icon, button, or feature module; or reviewing UI code.
---

# Deskstream UI

Deskstream's UI is a **dark-first** shadcn/ui (new-york, zinc) app on Tailwind v4 + React 18 + strict TypeScript, living in `web/` and built into `public/`. Every color is a **token** defined once in `web/src/shared/styles/globals.css`; every screen is assembled from the primitives in `web/src/shared/ui` and the frame in `web/src/shared/layout`. Your job is to keep it that way: a change that looks right in dark mode only, or that invents its own color or button, is unfinished.

## Steps

1. **Locate.** Decide where the change lives using [ARCHITECTURE.md](ARCHITECTURE.md): `app/views` (screens), `features/<name>` (a capability), or `shared/` (reused by two or more features). Done when you can name the folder and, for features, the `index.ts` you will export through.
2. **Reuse.** Build from existing primitives and layout before writing markup: [COMPONENTS.md](COMPONENTS.md). Done when every button, card, badge, field, dialog and icon in your change is the shared one, or you have added the missing variant to the shared primitive itself.
3. **Theme.** Style with token utilities only (`bg-card`, `text-muted-foreground`, `border-brand/25`, …). A new color means a new token in both `:root` and `.dark`, mapped in `@theme inline`: [THEME.md](THEME.md). Done when your diff contains zero color literals outside `globals.css`.
4. **Verify both themes.** Run the app (`cd web && npm run dev`, with `npm start` in the repo root for the API) and look at your change in dark (the default) and light via the topbar toggle. Done when contrast, borders and hover states read correctly in both, at phone width and desktop.
5. **Gate.** From `web/`: `npm run typecheck && npm run lint && npm test`, then `npm run build`. Done when all four pass and the regenerated `public/index.html`, `public/app.js`, `public/styles.css` are part of the change (they are committed; the server and Render serve them as-is).

## Hard constraints

These are enforced by the server or by tests; breaking one fails silently in the browser or loudly in CI.

- **CSP is `style-src 'self'`.** Style through classes, `classList`, or CSSOM (`el.style.x = …`). Libraries that inject `<style>` tags (Radix Dialog, Radix Select, Popover, most toast libs) are blocked; use the native-element primitives (`Dialog` on `<dialog>`, `NativeSelect`) instead. Fonts and images are `'self'` or `data:` only; no CDN.
- **The build emits exactly three files** with stable names (`index.html`, `app.js`, `styles.css`), because the server serves a fixed allowlist. Keep one JS chunk and one CSS file; dynamic `import()` is inlined, and assets are inlined into CSS.
- **Colors live only in `globals.css`.** `src/shared/theme/theme.test.ts` fails on any hex, `rgb()`, `hsl()` or `oklch()` elsewhere, and ESLint flags color string literals.
- **Features import each other only through `index.ts`.** ESLint `no-restricted-imports` enforces this.

## Design voice

Quiet, neutral zinc surfaces with one accent. **Brand red is scarce**: logo, live indicators, unread counts, the user's own chat bubbles, and the brand `IconChip` on the primary home card. Status uses `success` / `warning` / `info` / `destructive` tokens as soft tints (`bg-x/10 border-x/25 text-x`). Headings use Geist (`font-display`, applied automatically to `h1`–`h3`), body uses Inter, and technical data (IDs, timers, stats, step numbers) uses `font-mono`. Copy is plain and reassuring about privacy: the presenter approves every viewer, and access is view-only.
