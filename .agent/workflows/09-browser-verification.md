---
description: Exhaustive verification of app functionality via virtual browser tests (Golden Paths).
trigger: After any UI refactor, feature addition, or manual request to 'Verify App'.
---

# Workflow: Browser Verification & Golden Path Testing

## Phase 1: Infrastructure Readiness

**Goal**: Ensure the testing environment is capable of simulating a browser.

1. **Dependency Check**:
   - Verify `package.json` contains `vitest` (or `jest`), `@testing-library/react`, and `@testing-library/user-event`.
   - **Action**: If missing, install them immediately.

2. **Environment Setup**:
   - Ensure `vite.config.js` is configured for test environments (JSDOM environment).
   - Verify `src/setupTests.js` imports `@testing-library/jest-dom`.

## Phase 2: The "Golden Path" Definition

**Goal**: Define the critical user journeys that must never break.

The agent must verify these paths exists in `src/tests/integration/golden-paths.test.jsx`. If the file is missing or incomplete, create/update it.

### Path A: The "Planter" Journey (Dashboard Load)

- **Context**: User logs in and lands on Dashboard.
- **Checks**:
  - Sidebar renders with correct navigational items.
  - `DashboardLayout` wraps the content (verifying layout CSS).
  - "New Project" button is visible and uses `bg-brand-500` (Design System check).
  - Project list loads (handling empty states gracefully).

### Path B: The "Task" Journey (Board Interaction)

- **Context**: User navigates to a Project Board.
- **Checks**:
  - Task Columns (Todo, Doing, Done) render.
  - Task Cards render within columns.
  - Cards have `rounded-xl` and `shadow-sm` (Design System check).
  - Clicking a task opens the Detail Panel (Modal/Slide-over).

### Path C: The "Navigation" Journey

- **Context**: Switching views.
- **Checks**:
  - Clicking "Reports" updates the route to `/reports`.
  - Reports page renders without crashing.
  - Breadcrumbs update to reflect current path.

## Phase 3: Execution & Analysis

**Goal**: Run the suite and interpret results.

1. **Run Command**: `npm test` (or `npx vitest run`).

2. **Analyze Failures**:
   - **Render Error**: Often caused by missing Context Providers (`AuthContext`, `ToastContext`) in the test wrapper.
     - **Fix**: Wrap test components in `<AppProviders>`.
   - **Selector Error**: Button text changed?
     - **Fix**: Update test expectation or restore UI label.
   - **Style Error**: Class name missing?
     - **Fix**: Re-apply Design System utility classes.

## Phase 4: Adversarial Browser Agent (The "Real" Test)

**Goal**: Use the `browser_subagent` to physically interact with the running application, detecting visual bugs, layout shifts, or broken interactions that headless tests miss.

1. **Start Server**: Ensure app is running (`npm run dev`).
2. **Launch Agent**:
   - **Task**: "Act as a new user. Log in (if needed), navigate to the Dashboard, create a project, move a task. Report any visual glitches, confusing UI, or errors."
   - **Focus**: Look for overlapping text, broken z-indices, unclickable buttons, or "jank".
3. **Record**: Capture the session and note any "Human Experience" failures.

## Phase 5: Design Regression Check (Static Analysis)

**Goal**: Prevent "Design Drift" in the compiled output.

1. **Class Audit**:
   - Scan critical components (`TaskItem.jsx`, `SideNav.jsx`) for forbidden classes:
     - `bg-blue-500` (Should be `bg-brand-500`)
     - `shadow-lg` (Should be `shadow-sm`)
     - `text-black` (Should be `text-slate-900`)

2. **Correction**:
   - If forbidden classes are found, strictly verify against `.agent/rules/30-design-standards.md` and auto-correct.

## Phase 5: Reporting

**Goal**: Provide the user with confidence.

Output a summary:

- ✅ **Golden Paths**: [Pass/Fail]
- ✅ **Design Compliance**: [Pass/Fail]
- 📝 **Fixes Applied**: List of any auto-corrections made during the run.
