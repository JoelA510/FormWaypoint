---
trigger: always_on
---

# Design Standards (always-on)

## 1. Core Aesthetic: "Modern Clean SaaS"

**Goal:** A calm, high-focus interface that reduces cognitive load for church planters.
**Keywords:** Airy, Rounded, Subtle Depth, High Legibility.

### Strict Constraints

- **No Arbitrary Values:** Never use `w-[17px]` or `mt-[3px]`. Use standard Tailwind spacing (1, 2, 4, 6, 8).
- **No Pure Black:** Never use `#000000`. Use `slate-900` or `zinc-900` for text.
- **Whitespace:** Default to "Comfortable" density. Lists should have `gap-3` or `gap-4`, not `gap-1`.
- **Borders:** Use subtle borders (`border-slate-200`) instead of heavy outlines.

## 2. Component Blueprints

### Cards & Panels

- **Background:** `bg-white`
- **Border:** `border border-slate-200` (Never `gray-400`)
- **Radius:** `rounded-xl` (Standard), `rounded-2xl` (Modals)
- **Shadow:** `shadow-sm` (Default), `shadow-md` (Hover/Active)
- **Hover Effect:** `hover:border-brand-300 transition-colors duration-200`

### Buttons

- **Primary:** `bg-brand-500 hover:bg-brand-600 text-white font-medium rounded-lg shadow-sm active:scale-95 transition-all`
- **Secondary:** `bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 font-medium rounded-lg`
- **Ghost/Icon:** `text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-md p-2`

### Typography (Inter / System)

- **Page Titles:** `text-2xl font-bold text-slate-900 tracking-tight`
- **Section Headers:** `text-sm font-semibold uppercase tracking-wider text-slate-500 mb-3`
- **Body:** `text-sm text-slate-600 leading-relaxed`
- **Micro/Meta:** `text-xs text-slate-400`

## 3. Color System (Semantic Usage)

Use the defined CSS variables or Tailwind utility aliases. Do not hardcode hex values.

| Semantic Role     | Tailwind Class                    | Context                                     |
| :---------------- | :-------------------------------- | :------------------------------------------ |
| **Primary Brand** | `text-brand-600` / `bg-brand-500` | Main actions, active states, key highlights |
| **Surface**       | `bg-slate-50`                     | Page background (canvas)                    |
| **Panel**         | `bg-white`                        | Cards, sidebars, modals                     |
| **Success**       | `bg-emerald-50 text-emerald-700`  | Completion, valid states                    |
| **Warning**       | `bg-amber-50 text-amber-700`      | Non-blocking alerts                         |
| **Error**         | `bg-rose-50 text-rose-700`        | Destructive actions, errors                 |

## 4. Interaction & Micro-interactions

- **Hover:** All interactive elements must have a visual hover state (color shift or subtle lift).
- **Focus:** Custom focus rings are required for accessibility.
  - `focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 focus:outline-none`
- **Transitions:** Always add `transition-all duration-200 ease-in-out` to interactive elements.

## 5. Mobile-First Discipline

- **Touch Targets:** Minimum `h-10 w-10` or `p-3` for mobile buttons.
- **Layout:** Default to `flex-col` on mobile, `md:flex-row` on desktop.
- **Hidden UI:** Use `group-hover:opacity-100` patterns cautiously; ensure mobile users have an alternative way to access actions (e.g., specific "Edit" button visible on tap).

## 6. Behavioral & Ethical Constraints

### Modals & Overlays

- **Exit Strategy:** Every modal MUST have a visible 'X' icon or explicit "Cancel" button.
- **Context:** Use a backdrop with `bg-slate-900/50` (approx 50% opacity) to maintain context.
- **Focus:** Only use modals for tasks taking < 2 steps. Complex flows require a full page.

### Content & Labels

- **Explicit Labels:** Prohibit generic labels like "Click Here" or "Submit". Use specific actions: "Create Project", "Save Changes", "Send Invite".
- **Error Messages:** Must identify the specific field and solution (e.g., "Email is missing @ symbol"), not generic "Invalid Input".

### Accessibility & Ethics

- **Color Independence:** Never use color alone to convey status. Use icons or text labels alongside color (e.g., a Red dot + "Overdue" text).
- **No Dark Patterns:** Do not hide "Cancel" buttons or use confusing double-negatives in options.
