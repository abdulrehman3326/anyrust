# Frontend architecture

`web/src` is organized **feature-first** in three layers. Dependencies point downward only: `app` → `features` → `shared`.

```
web/src/
  app/          Composition root. main.tsx (providers), App.tsx (shell + state wiring),
                router.ts (path routes), views/ (one file per screen)
  features/     One folder per capability, each with a public index.ts:
                session, present, join, approval, chat, history, help, theme
  shared/       No feature knowledge. ui/ (primitives), layout/ (Page, Sidebar, Topbar),
                theme/ (ThemeProvider, applyTheme), styles/globals.css (tokens),
                api/ (HTTP/SSE client), lib/ (cn, format)
  test/setup.ts Vitest + jest-dom setup
```

## Layer rules

- **`shared/`** knows nothing about Deskstream features. Code moves here when a second feature needs it.
- **`features/<name>/`** exposes everything through `index.ts`; other code imports `@/features/<name>` only (ESLint-enforced). Larger features split internally into `components/`, `hooks/`, `lib/`, `model/` (see `features/session`). A feature may import another feature's *types* through its index (e.g. `SessionState`); runtime coupling between features goes through `App.tsx` instead.
- **`app/App.tsx`** wires features together with callbacks. Example: `useSession` receives `onChatMessage`, `onChatReset`, `onSessionRecorded`, so the session engine never imports chat or history. Follow this pattern for new cross-feature behavior.
- **`app/views/*View.tsx`** compose a screen from feature components inside `Page` + `PageHeader`. Every view takes `ViewProps` (`session`, `chat`, `history`). Shared view helpers (`ViewLink`, `StepsCard`, `ActiveSessionCard`) live in `app/views/shared.tsx`.
- Use the `@/` alias (→ `web/src`) for cross-folder imports; use `import type` for types (ESLint-enforced). No `any`.

## Routing

Path routing via the History API; the server answers `/share`, `/join`, `/session`, `/history` and `/help` with the app shell. Invite links `/#join=<id>:<token>` keep the secret in the fragment (never sent to the server), land on the session view, and `App.tsx` replaces the URL once a session starts so the token leaves the address bar. Legacy `#/view` URLs are rewritten to clean paths.

To add a view: add its name to `views` and `viewTitles` in `router.ts`, create `app/views/<Name>View.tsx`, register it in the `screens` map in `App.tsx`, and add a `NavEntry` if it belongs in the sidebar. Extend `router.test.ts`.

## Build and server contract

- `vite.config.ts` builds into `../public` with fixed names (`app.js`, `styles.css`, single chunk, inlined assets). The server's allowlist and CSP depend on this; see "Hard constraints" in SKILL.md.
- In dev, Vite proxies `/api` to `http://127.0.0.1:4317`; run `npm start` at the repo root alongside `npm run dev` in `web/`.
- The server (`server.mjs`) and its API are outside the UI's scope. The client talks to it only through `shared/api`.

## Tests

Vitest + Testing Library in jsdom, colocated as `*.test.ts(x)`. Logic (hooks, storage, formatting, routing, invitation parsing) is unit-tested; the theme test guards the color rule. Add a test next to any new pure logic.
