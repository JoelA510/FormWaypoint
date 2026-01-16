---
trigger: always_on
---

# Architecture & Feature-Sliced Design (FSD) Rules

## Directory Structure

We follow a modified Feature-Sliced Design (FSD) enabling Agents to reason about "Domains" in isolation.

### 1. `src/features/{domain}`

Contains **Business Logic** and **Domain Components**.

- **Structure**:
  - `components/`: React components specific to this feature.
  - `hooks/`: Custom hooks for this feature's state/logic.
  - `services/`: API calls and data transformation for this domain.
  - `index.js`: (Optional) Public API of the feature.

### 2. `src/shared`

Contains **Reusable** code with **NO Business Logic**.

- `ui/`: Dumb components (Buttons, Inputs, Modals) and Layouts.
- `lib/`: Pure functions (Date Math, Formatting), strictly typed and tested.
  - **Date Engine**: `src/shared/lib/date-engine` is the Single Source of Truth for date calculations.

### 3. `src/app`

Contains **Global Wiring**.

- Providers, Router, Store configuration, Global Styles, and Core Configuration.

## Critical Constraints

1. **Dependency Direction**:
   - `features` can import from `shared`.
   - `features` can import from _other_ `features` (pragmatic relaxation of strict FSD).
   - `shared` **CANNOT** import from `features`.

2. **No Direct API Calls in Components**:
   - UI components must use **Hooks** (`useTaskQuery`) or **Services**.
   - Never write `supabase.from(...)` inside a `.jsx` file.

3. **Date Logic Safety**:
   - **Never** perform raw date math (e.g., `date.setDate(date.getDate() + 5)`).
   - **Always** use `src/shared/lib/date-engine`.

4. **Strict Typing (JSDoc)**:
   - All new functions in `services` and `lib` must have JSDoc `@param` and `@returns`.
