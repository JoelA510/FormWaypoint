<!--
ROADMAP CONTRACT (keep this block at the top)

Scope:
- This document allows Product Owners and Developers to track high-level progress.
- It is the SINGLE SOURCE OF TRUTH for "What are we building?"

Update discipline:
- Update "Last Updated" date on every edit.
- Mark items as ✅ (Done), 🚧 (In Progress), 📅 (Planned), or ❌ (Skipped).
- Do not remove completed items; keep history visible (or move to a History section).
-->

# FormWaypoint Roadmap & History

**Last Updated:** 2026-01-16
**Current Focus:** Stabilization, Workflow Initialization, and Maintenance

---

## 1. Project History

A chronological overview of major eras.

| Era | Timeline | Key Milestones |
| :--- | :--- | :--- |
| **Phase 1-4: Foundation** | 2025-Q1 | **Ingestion & Schema**: Defined canonical models, built OCR pipeline, validated ingestion of PDF/XLSX/CSV. |
| **Phase 5-6: Core App** | 2025-Q2 | **Infra & UI**: Backend API, Job Queues, RLS Security, and React Frontend with virtualization. |
| **Phase 7-8: Outputs & Collab** | 2025-Q3 | **SLI/BOL & Workflow**: Generated compliance docs (NCBFAA SLI), added User Accounts, Roles, and Comments. |
| **Phase 9-10: Quality & Launch** | 2025-Q4 | **QA & Deploy**: E2E Playwright tests, CI Gates, Dockerization, and Production readiness. |
| **Phase 11-12: Polish** | 2025-Dec | **Design Overhaul**: Modern UI (Tailwind/Framer/Lucide), OCR specialized training, and Carrier Refinements. |

---

## 2. UX Workflows & Status

The core user journeys identified in the codebase.

### Document Management

| Workflow | Status | Notes |
| :--- | :--- | :--- |
| **Upload & Ingestion** | ✅ **Active** | Drag-n-drop, auto-parsing, and queue processing working. |
| **Document Review** | ✅ **Active** | Split-screen operator view for correcting OCR data. |
| **Export Generation** | ✅ **Active** | SLI/BOL PDF generation with deterministic versioning. |

### Settings & Admin

| Workflow | Status | Notes |
| :--- | :--- | :--- |
| **User Management** | ✅ **Active** | Roles, Invitations, and Permissions. |
| **Master Library** | ✅ **Active** | Product/Item management for reuse. |

---

## 3. Future Roadmap

Remaining phases and enhancement tracks.

### Phase 13: Operational Excellence

_Goal: Deepen integration stability and advanced automation features._

#### 13.1 Agent Workflow Integration

- **ID:** `P13-AGENT-OPS`
- **Goal:** Fully adopt the new agentic workflows for debt management and automated roadmapping.
- **Status:** 🚧 In Progress

#### 13.2 Advanced Debt Remediation

- **ID:** `P13-DEBT-CLEANUP`
- **Goal:** Execute Workflow 03 (Debt Audit) to identify and fix hidden legacy issues.
- **Status:** 📅 Planned

#### 13.3 Performance Tuning

- **ID:** `P13-PERF`
- **Goal:** Review virtualized list performance with larger datasets (>10k rows).
- **Status:** 📅 Planned
