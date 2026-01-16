---
description: Feature Injection (Monorepo)
---

You are in Planning mode.

Input: a feature request from the user.

Steps:

1. **Scope Analysis**:
   - Identify affected domains:
     - **Schema** (packages/schema): specific Zod changes?
     - **Backend** (pps/api): Hono routes, Prisma models?
     - **Frontend** (pps/web): React pages, components?
2. **Implementation Plan**:
   - Create/Update implementation_plan.md.
   - List new files and schema changes.
   - **Critical:** Define the schema changes first.
3. **Execution Order**:
   - Step 1: Update Schema & Types.
   - Step 2: Update Backend (API & DB).
   - Step 3: Update Frontend.
4. **Verification**:
   - Run 	urbo run test or 	urbo run build.

