# Components and patterns

Everything below is exported from `@/shared/ui` or `@/shared/layout`. Read the component file before extending it; each one documents its rules in a header comment.

## Primitives (`@/shared/ui`)

- **`Button`** has four variants at one height (h-9, 36px, matching inputs):
  - `primary`: the one main action of a view or card. One per card.
  - `outline` (default): every secondary action.
  - `ghost`: icon-only and toolbar or navigation controls.
  - `danger`: destructive actions (End session).
  Actions take a leading `<Icon>`. A trailing arrow marks navigation, via `ViewLink` in `app/views/shared.tsx`. `iconOnly` buttons need `aria-label`. Use `asChild` to style an `<a>`. Need a different look? Add a variant to `buttonVariants`, so every button stays in one place.
- **`Card`** with `CardHeader`, `CardTitle`, `CardDescription`, `CardAction`, `CardContent`, `CardFooter`. `padded={false}` for edge-to-edge lists or custom rows. `as="section" | "article" | "aside"` for semantics.
- **`Badge`** with `tone`: `neutral | outline | brand | success | warning | danger | info`, optional `dot` / `pulse` for live status.
- **`IconChip`**: the 40px square icon tile at the start of card headers and list rows. Tones: `neutral`, `brand`, `success`.
- **`Notice`**: inline alert with `tone`: `info | warning | danger`.
- **Fields**: `TextField`, `TextArea`, `SelectField` wrap `Label` + control + hint/error with ids and `aria-describedby` wired. Prefer them to the raw `Input` / `Textarea` / `NativeSelect`.
- **`Dialog`**: shadcn styling on native `<dialog>` (focus trap and inert background for free, CSP-safe).
- **`useToast()`** returns `show(message)`. Short, plain-language confirmations.
- **`Icon name="…"`**: lucide icons behind app-level names, stroke 1.75. To add one, import it in `shared/ui/Icon.tsx` and give it a semantic key (`share`, not `externalLink`).

## Layout (`@/shared/layout`)

- **`Page`** frames every view: `max-w-6xl`, `px-4 md:px-8`, `gap-8` rhythm.
- **`PageHeader`**: `title`, `description`, optional `eyebrow` (e.g. a status `Badge`) and `actions`. Page-level buttons go only in `actions`.
- **`SectionHeader`**: `h2` + description + optional action for each `<section>`, linked via `aria-labelledby`.
- **`Sidebar`** (fixed 240px at `lg`, a drawer below that) and **`Topbar`** (sticky, translucent `bg-background/80` with backdrop blur, breadcrumb, service status, theme toggle) are mounted once in `App.tsx`.

## Composition patterns

- Card grids: `grid gap-6 md:grid-cols-2` or `md:grid-cols-3`.
- Card header with icon: `IconChip` + a `space-y-1.5` block of `CardTitle` and `CardDescription`; footer button pinned with `CardFooter className="mt-auto"`.
- Live indicator: a `size-1.5` or `size-2.5` `bg-brand` dot with `animate-pulse` or `animate-ping`. Reserve it for an active session.
- Video stage: `bg-stage text-stage-foreground`, `aspect-video`, overlays as `bg-stage/80 backdrop-blur` pills (see `features/session/components/SessionPanel.tsx`).
- Spacing comes from the Tailwind scale (`gap-2/4/6/8`); radii from tokens (`rounded-md` controls, `rounded-lg` chips and alerts, `rounded-xl` cards).

## Accessibility baseline

The skip link, `main#main` focus target, and `:focus-visible` ring are global. Keep it intact: every interactive element is a real `button` / `a` / form control, icon-only controls carry `aria-label`, status changes use `role="status"` or `role="alert"`, and motion respects the global `prefers-reduced-motion` reset in `globals.css`.
