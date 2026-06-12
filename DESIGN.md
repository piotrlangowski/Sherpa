# Sherpa — Design System

> Visual + interaction guidelines for the Sherpa dashboard.
> Sherpa is a **local-first AI-feature ROI calculator for SaaS** — a financial-modeling
> tool whose UI has to make dense numbers (NPV, IRR, payback, TCO, ROI%) feel calm,
> credible and "CFO-grade". This document is the single reference for how the UI looks
> and behaves. The source of truth in code is **`src/routes/layout.css`** (theme tokens +
> the glass vocabulary); everything below describes how to use it.

---

## 1. Principles

1. **CFO-grade calm.** Numbers are the hero. Chrome recedes; data advances. No decorative
   gradients on content, no noise — just legible figures with clear semantic color.
2. **Liquid glass, not flat cards.** Surfaces are translucent, blurred panes layered over a
   soft tinted backdrop. Depth comes from blur + an inset top highlight, never heavy borders.
3. **Local-first confidence.** The product is private and deterministic; the UI should feel
   solid and trustworthy — generous spacing, consistent rhythm, no gimmicks.
4. **Semantic color is meaning, not decoration.** Green = value created, cyan = time, red =
   loss, amber = caution. Never use these hues decoratively.
5. **Light and dark are equals.** Every surface, color and shadow is defined for both themes.
   Don't ship a component that only looks right in one.

---

## 2. Tech & tooling

| Concern        | Choice |
|----------------|--------|
| Framework      | SvelteKit, **Svelte 5 runes mode** (forced project-wide) |
| Styling        | **Tailwind CSS v4**, configured entirely in CSS at `src/routes/layout.css` — there is **no `tailwind.config.js`** |
| Component kit  | **shadcn-svelte** (Bits UI) — registry style **`vega`**, base color `neutral` |
| Icons          | **Lucide** (`@lucide/svelte`) — the only icon set; no emoji |
| Charts         | **Apache ECharts** (lazy-imported per page) |
| Font           | **Inter Variable** (`@fontsource-variable/inter`) |
| Dark mode      | `mode-watcher` (`mode.current`, `toggleMode`), `.dark` class on root |
| PNG export     | `html2canvas-pro` (drives the `.exporting` flatten rules) |

Color tokens are **OKLCH** throughout. When you need a new tint, derive it from an existing
token with `color-mix(in oklch, …)` rather than inventing a hex value.

---

## 3. Color

All colors are CSS custom properties on `:root` (light) and `.dark`. Consume them through the
Tailwind aliases (`bg-primary`, `text-muted-foreground`, `border-border`, …) defined in the
`@theme inline` block — never hard-code raw values in components.

### 3.1 Core palette — hue family

The whole neutral system sits on **hue 250** (a cool blue-slate). Saturation on
"white"/"black" surfaces is kept ≤ 0.03 so backgrounds read as near-neutral, not blue.

| Token | Light | Dark | Use |
|-------|-------|------|-----|
| `--background` | `oklch(0.98 0.01 250)` | `oklch(0.11 0.03 250)` | App canvas (under the glass) |
| `--foreground` | `oklch(0.18 0.02 250)` | `oklch(0.95 0.015 250)` | Primary text |
| `--card` | `oklch(1 0 0)` | `oklch(0.14 0.03 250 / 0.6)` | Solid card fill (rarely used raw — prefer glass) |
| `--muted` | `oklch(0.94 0.01 250)` | `oklch(0.15 0.025 250)` | Subtle fills |
| `--muted-foreground` | `oklch(0.45 0.02 250)` | `oklch(0.65 0.02 250)` | Secondary / label text |
| `--border` | `oklch(0.88 0.01 250)` | `oklch(0.19 0.03 250)` | Hairlines, inputs |
| `--secondary` | `oklch(0.92 0.01 250)` | `oklch(0.16 0.03 250)` | Quiet button / toggle fill |

### 3.2 Primary (brand accent)

The primary **shifts hue between themes** — this is intentional, not a bug:

- **Light:** `--primary: oklch(0.45 0.18 250)` — a confident **indigo**.
- **Dark:** `--primary: oklch(0.70 0.18 200)` — a luminous **cyan/teal** that glows against the near-black canvas.

Primary is used for: the logo mark, active nav state (`bg-primary/10 text-primary`),
the active-scenario widget, focus rings, and one KPI glow. Use it sparingly — it should feel
like an accent, not a fill.

### 3.3 Semantic / financial colors

These carry **meaning**. Always pair the light and dark variant.

| Meaning | Class pattern | Where |
|---------|---------------|-------|
| Value created / positive | `text-emerald-600 dark:text-emerald-400` | Positive NPV, IRR ≥ hurdle, ROI ≥ 0 |
| Time / payback | `text-cyan-600 dark:text-cyan-400` | Payback period |
| Loss / negative | `text-rose-600 dark:text-rose-400` | Negative NPV / ROI |
| Caution | `text-amber-600 dark:text-amber-400` | IRR below hurdle, "no AI benefit modeled" warnings |
| Destructive | `text-destructive` / `bg-destructive/10` | Delete actions, calculation failure (`--destructive: oklch(0.60 0.20 25)`) |

KPI figures flip color by sign, e.g.:
`class={results.npv >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`

### 3.4 Chart colors

ECharts series pull from `--chart-1…5`. `--chart-1` is the primary; the rest fan out across
hues at matched chroma. Read them off the CSS variables at render time so charts re-theme on
dark-mode toggle (the dashboard re-renders on `mode.current` change).

| | Light | Dark |
|--|-------|------|
| `--chart-1` | `oklch(0.45 0.18 250)` | `oklch(0.70 0.18 200)` |
| `--chart-2` | `oklch(0.70 0.18 200)` | `oklch(0.65 0.24 270)` |
| `--chart-3` | `oklch(0.65 0.20 330)` | `oklch(0.65 0.20 330)` |
| `--chart-4` | `oklch(0.80 0.15 140)` | `oklch(0.80 0.15 140)` |
| `--chart-5` | `oklch(0.55 0.20 20)` | `oklch(0.55 0.20 20)` |

---

## 4. The liquid-glass vocabulary

This is Sherpa's signature. Glass surfaces are defined **outside `@layer`** in `layout.css` so
they beat Tailwind utilities in the cascade. Each tier sets `background-color` +
`border-color` + `box-shadow` + `backdrop-filter`; you still control **border width and
radius** per element (`border`, `rounded-xl`).

| Class | What it is | Typical use |
|-------|-----------|-------------|
| `.glass` | 55%-opacity pane, `blur(12px) saturate(150%)`, soft layered shadow with inset top highlight | Cards, control bars, list/table containers |
| `.glass-strong` | 78%-opacity, `blur(24px) saturate(180%)`, deeper shadow | Header bar, dialogs, dropdown/select/popover menus |
| `.glass-inset` | Recessed tint, **no** backdrop-filter (GPU cost / nested-blur artifacts) | Card headers & footers, sidebar top/bottom panels, input wells |
| `.glass-glow` | `.glass` shadow **plus** a colored aura via `--glow-color` | KPI hero cards |

**Canonical KPI card:**

```html
<Card class="glass border glass-glow [--glow-color:var(--color-emerald-500)] select-none p-4 flex flex-col justify-between">
  <div>
    <span class="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Incremental NPV</span>
    <CardTitle class="text-xl font-black mt-2 block text-emerald-600 dark:text-emerald-400">$1,240,000</CardTitle>
  </div>
  <div class="text-[10px] text-muted-foreground/80 mt-1">Discounted lifetime net value</div>
</Card>
```

**Card header/footer bars** sit flush to the card edge using `glass-inset` — the shared `Card`
zeroes its block padding when it detects a `glass-inset` header (`:has()` rule in `layout.css`),
so don't add your own compensating margins.

**App backdrop:** the shell root carries `.app-backdrop` (background color + two faint radial
gradient glows in primary and chart-2), and `AppShell.svelte` adds two large `blur-[120-150px]`
decorative blobs (`bg-primary/10`, `bg-emerald-500/10`) behind the content. Glass panes float
over this — never put glass on a plain white div.

**Recessed input wells** inside glass use `bg-(--glass-inset-bg)` rather than `bg-black/10`
(which reads muddy). Example: the search input and sort/filter `<select>`s on the scenarios page.

**Motion:** glass transitions use `--ease-glass: cubic-bezier(0.32, 0.72, 0, 1)` and ~250ms.
Dialogs animate with this curve.

**Export caveat:** `html2canvas-pro` can't render `backdrop-filter`. During capture an
`.exporting` class flattens all glass to `--glass-export-bg` (solid) and drops shadows. If you
add a new glass-like surface, make sure it degrades under `.exporting` too.

---

## 5. Typography

- **Family:** Inter Variable for everything (`--font-sans`). No serif, no second family.
- **Numbers in tables** use `font-mono` + `text-xs` for tabular alignment; KPI hero figures use
  `font-black` (900) at `text-xl`+ for impact.

| Role | Recipe |
|------|--------|
| Page title (h2) | `text-2xl font-bold tracking-tight` |
| Page subtitle | `text-sm text-muted-foreground` |
| Eyebrow / section kicker | `text-xs font-bold uppercase tracking-wider text-primary` |
| Card title | `text-base font-bold` |
| KPI value | `text-xl font-black` (+ semantic color) |
| KPI micro-label | `text-[10px] uppercase font-bold tracking-wider text-muted-foreground` |
| Sidebar group header | `text-xs font-semibold uppercase tracking-wider text-muted-foreground/50` |
| Table cell number | `font-mono text-xs` |
| Helper / meta | `text-[10px]–text-xs text-muted-foreground/60–80` |

Pattern: **tiny, uppercase, tracked, muted labels above big bold values.** That contrast (quiet
caption → loud number) is the core typographic move across every dashboard widget.

---

## 6. Spacing, radius & shape

- **Radius scale** keys off `--radius: 0.75rem` (12px), with derived `--radius-sm…4xl`
  (`calc(--radius * 0.6 … 2.6)`). Cards/containers use `rounded-xl`; pills use `rounded-full`;
  dialogs use `rounded-2xl`.
- **Vertical rhythm:** pages are wrapped in `space-y-6`; card grids use `gap-4`–`gap-6`.
- **Shell metrics:** sidebar `w-64`; header `h-14`; main content padding `px-8 py-6`.
- **Layout primitive:** always lay out rows/groups with **flex/grid + `gap`**, not inline
  siblings or per-element margins (survives reorder/delete cleanly).
- **Badges/pills:** `inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold`.
  Two live in the header: a neutral currency badge (`bg-muted`) and a `Local-First` badge
  (`bg-primary/10 text-primary border-primary/20`).

---

## 7. Components

### 7.1 shadcn-svelte (`src/lib/components/ui/`)

Generated from the **`vega`** registry. **Prefer regenerating/adding via the shadcn CLI over
hand-editing.** Available: `alert, badge, button, card, checkbox, dialog, dropdown-menu, input,
label, popover, select, separator, sheet, sidebar, skeleton, slider, switch, table, tabs,
textarea, tooltip`.

**Button** variants & sizes (from `button.svelte`, via `tailwind-variants`):

- Variants: `default` (solid primary), `outline`, `secondary`, `ghost`, `destructive`
  (tinted: `bg-destructive/10 text-destructive`, not a solid red fill), `link`.
- Sizes: `xs, sm, default (h-9), lg, icon, icon-xs, icon-sm, icon-lg`.
- Buttons render as `<a>` when given `href`. Active press = `translate-y-px`.
- Icons inside buttons: Lucide at `h-4 w-4` with `mr-1.5`/`mr-2`.

### 7.2 App components (`src/lib/components/`)

- **`layout/AppShell.svelte`** — backdrop + decorative glow blobs + sidebar + `glass-strong`
  header (breadcrumbs left; currency badge, Local-First badge, theme toggle right) + scrollable
  content area. Wrap every page in this.
- **`layout/Sidebar.svelte`** — `w-64`, translucent (`bg-sidebar/70 backdrop-blur-xl`). Branding
  block (Compass logo mark on `bg-primary`) in a `glass-inset` top panel; nav grouped into
  **Planning · Catalog · Market · Costs** with uppercase group headers; a bottom `glass-inset`
  panel holding the **Active Scenario widget** and Workspace Settings link.
- **`layout/Breadcrumbs.svelte`**, **`dashboard/ExportButton.svelte`** (PNG export),
  **`forms/`** (`FormDialog`, `FormField`, `FormSection`, `NumberField`), **`catalog/`** entity
  forms, **`wizard/SetupWizard.svelte`** (first-run 3-step setup).

### 7.3 Recurring page patterns

- **Page header:** flex row — left: `h2` title + muted subtitle (optionally an eyebrow kicker);
  right: action buttons (`outline` secondary actions, solid `default` primary action with a
  leading icon).
- **Active nav link:** `bg-primary/10 text-primary font-semibold`; inactive:
  `text-muted-foreground hover:bg-muted/50 hover:text-foreground hover:translate-x-0.5`.
- **Glass control bar:** `glass border p-3 rounded-xl` holding search (`Input` with inset
  `Search` icon), sort/filter `<select>`s on `bg-(--glass-inset-bg)`, and a card/list **view
  toggle** (segmented `secondary`/`ghost` buttons). View mode persists to
  `localStorage` (`sherpa_view_mode_*`).
- **Empty state:** `Card` with `border-dashed border-border`, centered icon in a
  `bg-primary/10` circle, short heading + muted explainer.
- **Status callouts:** info/failure use tinted cards (`bg-destructive/5 border-destructive/30`,
  `bg-amber-500/5 border-amber-500/30`) with a leading Lucide icon and bold colored heading.

---

## 8. Number & value formatting

Use the helpers in `src/lib/utils/format.ts` — never format inline:

| Helper | Output | Notes |
|--------|--------|-------|
| `formatCurrency(v, currency, decimals=0)` | `$1,240,000` | Symbol position per currency; default 0 decimals for KPIs |
| `formatPercent(v, decimals=1)` | `12.5%` | Expects a decimal (`0.125`) |
| `formatNumber(v, decimals=0)` | `5,000` | Thousands separators |
| `formatTokens(v)` | `1.2M`, `4.0K` | Compact for token counts |
| `formatMonths(v)` | `2 yrs 3 mos`, `18 days`, `∞` | Humanized payback; `null` → `∞` |

Special-case strings the UI relies on: payback shows **"Immediate"** (0), **"Not within
horizon" / "Never"** (`null`); IRR shows **"N/A"** when unsolvable.

---

## 9. Dark mode

- Toggle lives in the header (`Sun`/`Moon`, `toggleMode` from `mode-watcher`).
- Every token, glass variable and shadow has a `.dark` value — when adding tokens, define both.
- Primary intentionally shifts indigo → cyan in dark. Semantic colors step **up** in lightness
  (`-600` light → `-400` dark) to keep contrast on the near-black canvas.
- Charts must re-read CSS vars on theme change (dashboards re-render on `mode.current`).

---

## 10. Motion & accessibility

- **Easing:** `--ease-glass` (`cubic-bezier(0.32, 0.72, 0, 1)`) for surfaces/dialogs; ~200–250ms.
- **Micro-interactions:** nav links nudge `translate-x-0.5` on hover; icons `scale-105` /
  rotate (settings gear `rotate-45`); the active-scenario widget pulses a status dot and shows a
  1.5s emerald "recalculated" glow after navigation settles.
- **Reduced motion:** a global guard in `layout.css` collapses all animation/transition to
  ~0ms under `prefers-reduced-motion: reduce` (tw-animate-css ignores it otherwise). Don't
  rely on motion to convey state.
- **Focus:** `focus-visible` rings use `--ring` at `ring-3`; inputs surface `aria-invalid`
  with destructive ring/border. Keep visible focus on all interactive elements.
- **Non-selectable chrome:** decorative/structural chrome carries `select-none`; keep it off
  actual data so numbers stay copyable.

---

## 11. Do / Don't

**Do**

- Build surfaces from the glass tiers; let the `.app-backdrop` glow show through.
- Use semantic financial colors only for their meaning, with light+dark pairs.
- Lead values with a tiny uppercase muted label; make the number `font-black`.
- Format every number through `utils/format.ts`.
- Add or modify shadcn components via the CLI (style `vega`).

**Don't**

- Don't invent hex colors — derive from OKLCH tokens / `color-mix`.
- Don't put glass on a plain white background, or stack `backdrop-filter` inside `backdrop-filter`
  (use `glass-inset` for nested recesses).
- Don't use gradients on content, emoji, or a second font family.
- Don't ship a surface that breaks under `.exporting` (PNG export) or in dark mode.
- Don't space UI rows with bare inline siblings — use flex/grid + `gap`.
