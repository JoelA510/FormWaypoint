---
trigger: always_on
---

# Engineering Standards (always-on)

## TypeScript / JavaScript

- Prefer strict typing. Default to `unknown` at boundaries; validate/parse before use.
- Avoid `any`. If unavoidable, confine it to a single boundary and justify in a comment.
- Prefer explicit return types for exported functions.
- React:
  - Avoid effect bugs: correct dependency arrays; no hidden stale closures.
  - Add error boundaries for user-facing shells/routes when appropriate.
  - Accessibility: ARIA labels where needed, keyboard navigation not broken.

## Testing

- **Framework**: Vitest for Unit/Integration tests.
- **Pattern**: Colocate tests with components (e.g., `Component.test.jsx`).
- **Mocking**: Use `vi` from Vitest for mocking; avoid global test pollution.

## CSS

- Prioritize TailwindCSS utility classes.
- Avoid arbitrary values (e.g. `w-[17px]`) in favor of design tokens.
- Use `clsx` or `tailwind-merge` for conditional class joining.

## Python

- Type hints on public functions.
- Validate external data at boundaries.
- Use context managers for resources.

## Data / DB

- Migrations must be reversible or have a rollback note.
- Validate inputs at API boundaries.
- Prefer idempotent operations.

## Performance

- No premature optimization.
- For known hotspots (N+1 queries, deep recursion, large lists), document the complexity and add a test/benchmark if feasible.

## Architecture & Consistency Strings (Hard Constraints)

- **No Recursive RLS**: Always check for root_id existence before writing policies.
- **Client-Side IDs**: For bulk operations (Templates), generate UUIDs in JS.
- **Optimistic Rollbacks**: Every optimistic UI update must have a catch block that force-refetches data.
- **UTC Midnight**: Never save local timestamps for Project Start/End dates.
- **Consistency Plan**: When affecting Schema/RLS or Optimistic Updates, explicitly state the consistency plan before coding.
