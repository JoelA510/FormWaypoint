---
trigger: always_on
---

# Design Standards (FormWaypoint)

## 1. Core aesthetic: technical, dense, unambiguous

**Goal:** A clean, data-dense interface for one job — reading a parsed shipment, correcting
what only a person can supply, and generating a form that gets signed under penalty.
**Keywords:** precise, technical, high-contrast, information-dense.

The screen is a review surface, not a dashboard. Every value a reviewer sees should make
clear where it came from: the document, the item library, or them.

## 2. Colour comes from tokens, never from the Tailwind palette

Tailwind v4 is configured CSS-first: the palette is a set of semantic OKLCH tokens declared
in `@theme` in `src/styles/globals.css`, with a `prefers-color-scheme: dark` block
redeclaring the same names. Components reference them as arbitrary values:

```tsx
<span className="text-[var(--color-ink-soft)]">
<section className="rounded-lg border bg-[var(--color-surface)] shadow-sm">
```

**Do not write `text-slate-900`, `bg-white`, `border-slate-200` or any other raw palette
class.** They are absent from the codebase on purpose: a raw colour is invisible to the
dark block and will read correctly in one scheme and wrongly in the other. `border-color`
defaults to `--color-line` in `@layer base`, so a bare `border` is already themed.

| Token family | Names | Use |
| :--- | :--- | :--- |
| Surfaces | `canvas`, `surface`, `sunken` | page, card, inset panel |
| Rules | `line`, `line-strong` | separation; `line-strong` for emphasis |
| Text | `ink`, `ink-soft`, `ink-faint` | primary, secondary, tertiary |
| Accent | `accent`, `accent-ink`, `accent-soft` | interactive, focus ring, tint |

## 3. Status colour is check severity, not shipment lifecycle

This tool has no shipment lifecycle — nothing here is booked, in transit, or delivered. It
has check severity, and that is what the status tokens encode. The vocabulary in the code
is `blocking` and `warning`.

| Meaning | Token | Where |
| :--- | :--- | :--- |
| **Blocking** — generation is refused | `block`, `block-soft` | failed `reconcile()` or `checkDraft()` checks |
| **Warning** — proceed, but be told | `warn`, `warn-soft` | dataset staleness, stated-ECCN notices, row overflow |
| **Pass** — proved against the source | `pass`, `pass-soft` | totals that sum back to the document |

Blocking and warning must never look alike. A reviewer who confuses them either chases
something the tool only wanted them to see, or assumes a refusal was advice.

## 4. Component blueprints

- **Cards & panels:** `rounded-lg border bg-[var(--color-surface)] shadow-sm`
- **Radius:** `rounded-lg`, sharper than consumer apps
- **Density:** `text-xs` / `text-sm` in tables. A reviewer needs the whole commodity table
  in view without scrolling it out of context.
- **Spacing:** standard Tailwind scale only. Arbitrary values are for colour tokens, not
  for margins, padding, or gaps.
- **Semantics:** native elements where they suffice. Keyboard and screen-reader behaviour
  is a bar, not a nicety; `eslint-plugin-jsx-a11y` runs in `npm run check`.
