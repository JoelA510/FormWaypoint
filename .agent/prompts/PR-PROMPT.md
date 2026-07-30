# Role

You are a Senior Software Architect assisting a developer in creating a professional, high-context Pull Request description in the style of **Gemini Code Assist**.

# Goal

Transform the raw code changes and roadmap items provided below into a structured PR description that satisfies three distinct audiences:

1. **Product Owner:** Needs to see progress against the roadmap.
2. **Lead Architect:** Needs to understand structural changes, trade-offs, and technical debt without reading every line.
3. **Code Reviewer:** Needs a map of _where_ to look and specific instructions on _how_ to verify the feature works.

# Input Data

I will provide:

1. **The Code Changes:** (Git diff or list of changed files)
2. **The Roadmap Context:** (Which items this PR addresses)

# Output Instructions

Generate the response in Markdown using **specifically** the following template. Do not deviate from this structure. Output the response to a file at `PR_DESCRIPTION_DRAFT.md`. The file will be in the .gitignore so it will not be committed.

---

# Pull Request: [Title e.g., Core Resilience & Engineering Excellence]

## 📋 Summary

[Write a 2-3 sentence executive summary describing the overall goal of this PR. This should be user-facing language that a Product Owner can understand. Focus on the _why_ and _what_ of the changes, not the _how_.]

**Example:**

> This pull request focuses on a comprehensive 'Health & Hygiene' initiative to bolster the application's core resilience, streamline state management, and modernize development workflows. It involves significant architectural refactoring on both the frontend and backend, enhancing performance, security, and maintainability across the board.

## ✨ Highlights

[Write 4-7 bullet points summarizing the most important changes. Each bullet should have a **bolded key concept** followed by a colon and detailed explanation. Think of these as the "headline features" of the PR.]

**Example:**

- **Second CIPL format:** The SAP-style `OMRON SHIPMENT#` layout now sits behind a format registry that detects the document and dispatches to its own parser; everything downstream is unchanged, so a third format is a detector and a parser.
- **Weights the document does not state:** That format prints no weights, so box 26 is supplied from the item library or a per-part table. The reconciliation reports those figures as *supplied* rather than *proved*, because there is nothing in the document to prove them against.
- **A part with no known weight blocks generation** rather than defaulting to zero. A form that looks complete and is wrong is the worst outcome this tool can produce.

## 🗺️ Roadmap Progress

| Item ID | Feature Name | Phase | Status                   | Notes   |
| ------- | ------------ | ----- | ------------------------ | ------- |
| [ID]    | [Feature]    | [1]   | ✅ Done / 🚧 In Progress | [Notes] |

## 🏗️ Architecture Decisions

### Key Patterns & Decisions

- **Pattern A:** [Explanation of why we chose this approach]
- **Tech Debt:** [e.g., The overflow warning names the row count but not which rows were dropped; a continuation sheet would replace it.]

### Logic Flow / State Changes

```mermaid
graph TD
    A["User Actions"] --> B["Component"]
    B --> C["New Service"]
```

> **Note**: Always use quotes for node labels to prevent syntax errors (e.g., `A["Label"]`).

## 🔍 Review Guide

### 🚨 High Risk / Security Sensitive

- `src/domain/reconcile/*` - [Changes what is proved against the source document]
- `src/carriers/*/adapter.ts` - [Changes what lands in a box on a signed form]
- `src-tauri/src/*.rs` - [Native surface: filesystem paths, network fetch, process spawn]

### 🧠 Medium Complexity

- `src/domain/cipl/*` - [Parsing a document shape]
- `src/features/*` - [Review and output UI]

### 🟢 Low Risk / Boilerplate

- `src/styles/globals.css`
- `src/components/ui.tsx`

## 🧪 Verification Plan

### 1. Environment Setup

- [ ] Run `npm install` (New dependencies added: `[package-name]`)
- [ ] Run `npm run check` — typecheck, lint, tests, production build. CI runs exactly this.
- [ ] Note whether any change needs the uncommitted shipment fixtures to verify; a clean
      checkout runs 200 tests and skips 122.

### 2. Manual Verification

- **[Feature Area 1]:**
  1. [Step-by-step instruction]
  2. [Expected outcome]
- **[Feature Area 2]:**
  1. [Step-by-step instruction]
  2. [Expected outcome]

### 3. Automated Tests

```bash
npm test -- [test file path]
npm run lint
```

---

<details>
<summary><strong>📉 Detailed Changelog (Collapsible)</strong></summary>

- `src/features/review.tsx`: Added the provenance badge to each commodity row
- `src/domain/reconcile/index.ts`: Fixed the line join for repeated purchase orders
- ...

</details>

---

**[Paste Roadmap Items Here]**
**[Paste Git Diff / Code Here]**
