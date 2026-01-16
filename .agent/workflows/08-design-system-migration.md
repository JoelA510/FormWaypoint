---
description: 'Systematic audit and refactor of UI components to match Design Standards (Rule 30).'
trigger: "Manual request (e.g., 'Fix the styling', 'Audit UI') or after major UI feature work."
---

# Workflow: Design System Migration

## Phase 1: The "Drift" Audit

**Goal:** Identify deviations from Rule 30 (Design Standards).

1. **Scan for Hardcoded Styles:**
   - Search for `style={{` in .jsx files. (Exception: Dynamic values like drag position).
   - Search for arbitrary Tailwind values: `w-[`, `h-[`, `m-[`, `p-[`.
   - Search for hex codes: `#` (Should be 0 occurrences in JSX; acceptable in index.css theme definition only).
2. **Scan for "Dirty" Colors:**
   - Search for `gray-` (Should be `slate-`).
   - Search for `blue-` (Should be `brand-` or semantic status colors).
   - Search for `border-gray-400` (Violates "Subtle Border" rule).
3. **Scan for Layout Hacks:**
   - Check for `!important` in CSS or `!` prefix in Tailwind (e.g., `!w-full`).
   - Check for fixed pixel widths in main layout containers (breaks mobile).

## Phase 2: Component Standardization

**Goal:** Refactor core elements to match "Component Blueprints".

1. **Cards & Panels:**
   - Target: divs with shadow, border.
   - Action: Standardize to `bg-white rounded-xl border border-slate-200 shadow-sm`.
   - Remove: Heavy shadows (`shadow-lg`, `shadow-xl`) unless it's a modal/dropdown.
2. **Buttons:**
   - Target: All `<button>` elements.
   - Primary: `bg-brand-500 hover:bg-brand-600 text-white`.
   - Secondary: `bg-white border border-slate-300 hover:bg-slate-50 text-slate-700`.
   - Constraint: Ensure `min-h-[40px]` or `p-3` for touch targets.
3. **Typography:**
   - Target: h1, h2, h3, p.
   - Action: Enforce `slate-900` for headings, `slate-600` for body.
   - Remove: Pure black text.

## Phase 3: Global Cleanup

**Goal:** Remove legacy CSS that conflicts with Tailwind.

1. **CSS File Audit:**
   - Review `src/styles/*.css`.
   - Identify classes that can be replaced with utility classes (e.g., `.card { padding: 20px }` -> `p-5`).
   - Move necessary custom animations to `tailwind.config.js` or `index.css` `@theme`.
2. **Variable Injection:**
   - Ensure `index.css` defines the semantic variables (`--color-brand-primary`, etc.) referenced in `repo-context.yaml`.

## Phase 4: Visual Verification

**Goal:** Ensure no regressions.

1. **Mobile Check:**
   - Verify `DashboardLayout` has no horizontal scroll on small screens.
   - Verify Sidebar collapses correctly.
2. **Contrast Check:**
   - Ensure text on `brand-500` is white.
   - Ensure text on `slate-50` backgrounds is `slate-600` or darker.
