# Design Guidelines — zycron

Source of truth for visual decisions across the frontend. Consult before adding
a new screen, component, or style. Derived from what's already implemented in
`apps/frontend` — this document describes existing convention, it doesn't
invent a new system.

## Design language

iOS/macOS-inspired: generous corner radii, restrained color, soft depth via
shadow and blur rather than borders, content-first layouts with lots of
whitespace. Avoid "generic SaaS dashboard" chrome (heavy borders, saturated
gradients, boxy cards).

## Tokens

All color is defined as CSS variables in `apps/frontend/src/app/globals.css`
(`:root` for light, `.dark` for dark) and exposed to Tailwind in
`apps/frontend/tailwind.config.ts`. Never hardcode hex colors in components —
use the Tailwind classes below so light/dark both stay correct.

| Tailwind class                   | Purpose                                                                                            |
| -------------------------------- | -------------------------------------------------------------------------------------------------- |
| `bg-bg`                          | Page background                                                                                    |
| `bg-surface`                     | Card / panel background                                                                            |
| `bg-surface-2`                   | Secondary surface (hover states, subtle fills)                                                     |
| `border-border`                  | All borders                                                                                        |
| `text-fg`                        | Primary text                                                                                       |
| `text-muted`                     | Secondary / helper text                                                                            |
| `bg-primary` / `text-primary`    | Brand blue (iOS blue `#0A84FF`)                                                                    |
| `text-primary-fg`                | Text on top of `bg-primary`                                                                        |
| `success` / `warning` / `danger` | Status colors, always paired with `/15` background + solid text, e.g. `bg-success/15 text-success` |

Adding a new color: add the CSS variable to both `:root` and `.dark` in
`globals.css`, then map it in `tailwind.config.ts`. Don't introduce one-off
colors in component files.

## Spacing

Use Tailwind's default scale (4px base, i.e. `p-4` = 16px). Prefer the 8px
rhythm for layout-level spacing (`gap-2`, `gap-4`, `gap-6`, `gap-8`, `p-6`,
`p-8`) and reserve 4px steps (`gap-1`, `p-1`) for tight, in-component spacing
(icon-to-label, badge padding).

## Radius

| Token                  | Value   | Use                                            |
| ---------------------- | ------- | ---------------------------------------------- |
| default (`rounded-lg`) | 0.5rem  | small inline elements                          |
| `rounded-xl`           | 1rem    | inputs, buttons (non-pill), small icons/badges |
| `rounded-2xl`          | 1.25rem | icon containers, medium panels                 |
| `rounded-3xl`          | 1.75rem | cards, modals, the login card                  |
| `rounded-full`         | pill    | buttons (`Button` component default), avatars  |

Never mix an arbitrary radius value (`rounded-[14px]`) — pick the closest
token above.

## Typography

System font stack (Next.js default). Hierarchy is built with size + weight,
not color, for the primary/secondary split:

- Page/section title: `text-lg font-semibold` to `text-2xl font-semibold`
- Body: `text-sm` (default UI density is compact/information-dense, not
  spacious editorial)
- Secondary/help text: `text-sm text-muted`
- Micro/labels: `text-xs`

## Shadows & surfaces

- `shadow-soft` — default resting elevation for cards and primary buttons
  (`0 2px 12px rgba(0,0,0,0.06)`). Subtle by design — never stack heavier
  shadows on top.
- `shadow-glass` — used for elevated overlays (modals, the login card):
  `0 8px 32px rgba(0,0,0,0.12)`.
- `.glass` utility class — frosted surface (`backdrop-filter: blur(20px)
saturate(160%)` over `bg-surface/70` + hairline border). Use sparingly, only
  where content sits above a background with visual interest (gradients,
  imagery). Don't apply `.glass` on top of flat `bg-bg`.
- `.card` utility class — the default solid surface: `bg-surface` + 1px
  `border-border` + `rounded-3xl` + `shadow-soft`. Prefer the `Card` component
  (`apps/frontend/src/components/ui.tsx`) over recreating this by hand.

## Components

Central library lives in `apps/frontend/src/components/ui.tsx`, built on
`class-variance-authority` (`cva`) for variants and `cn()`
(`apps/frontend/src/lib/utils.ts`, `clsx` + `tailwind-merge`) for merging
classes. Always extend this file rather than hand-rolling a new button/input
in a page.

- **Button** — variants `primary | ghost | outline | danger`, sizes
  `sm | md | lg`. Pill-shaped, `active:scale-[.98]` press feedback,
  `focus-visible:ring-2 ring-primary/50` for keyboard focus. Add new variants
  here, not as one-off classes on a `<button>`.
- **Input** — rounded-xl, `bg-surface` + `border-border`, focus ring
  `ring-primary/40`. Supports `leadingIcon`/`trailingIcon` and
  `state="error" | "success"` (border + ring recolor to `danger`/`success`,
  optional helper text below via `hint`/`error` props) — see the login form
  for the reference usage.
- **Checkbox** — custom-styled, `rounded-md`, checked state fills
  `bg-primary`, animates the checkmark in with `framer-motion`. Always paired
  with a clickable `<label>`, never a bare native checkbox.
- **Card** — the standard content container; pass `className` to adjust
  padding/radius only when the default (`p-5`, inherits `.card`) doesn't fit.
- **StatusPill** — status badges; extend `STATUS_STYLES`/`STATUS_LABEL` maps
  for new statuses instead of inlining colors at the call site.

## Motion

`framer-motion` is the only animation library — don't add a second one.

- Entrances: `initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}`
  (fade + slide-up), duration ~0.4s, `ease: 'easeOut'`.
- Staggered children (e.g. form fields, list items): wrap in a parent with
  `staggerChildren` around 0.05–0.08s — keep the whole sequence under ~0.5s
  total so it reads as quick, not slow.
- Hover/press: prefer CSS (`transition`, `active:scale-[.98]`,
  `hover:brightness-110`) over JS-driven motion for cheap, high-frequency
  interactions like buttons.
- Never animate layout-shifting properties (width/height) without
  `layout`/`AnimatePresence` — prefer opacity/transform.
- Respect `prefers-reduced-motion`; keep durations short enough (≤400ms) that
  disabling them entirely is an acceptable fallback.

## Responsive rules

Mobile-first with Tailwind breakpoints (`sm`, `md`, `lg`). Split-panel layouts
(e.g. login) collapse to a single column below `lg`; the institutional/
marketing panel either stacks above the form (compact) or is hidden if it adds
no functional value on small screens. Never let a fixed-width panel force
horizontal scroll — verify at 375px, 768px, 1024px, and 1440px.

## Accessibility baseline

- All interactive elements get a visible focus ring (`focus-visible:ring-2`)
  — never `outline-none` without a replacement.
- Icon-only controls need `aria-label`.
- Form errors are associated to their input via `aria-describedby` and
  `aria-invalid`, not color alone.
- Color is never the sole signal for state (pair with icon/text for
  error/success).

## What not to do

- No new color values outside the token table above.
- No second component library (no shadcn/Radix/MUI) — extend `ui.tsx`.
- No second animation library.
- No arbitrary one-off shadow/radius values in component `className`s.
- No dashboard-style heavy borders/dense chrome — this product's visual
  register is calm and minimal.
