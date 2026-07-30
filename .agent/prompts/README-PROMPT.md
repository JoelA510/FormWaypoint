# README Generation Prompt

## Your Task

You are a senior software architect conducting a thorough code review. Your goal is to produce a README that enables a code reviewer or project manager with zero prior context to understand this codebase within 15 minutes.

## Instructions

### Phase 1: Deep Analysis (Do This First)

Before writing anything, systematically review the codebase:

1. **Map the file structure** — Identify all directories and their purposes
2. **Identify entry points** — Find main/index files, routing, app initialization
3. **Trace data flow** — Follow the document: PDF bytes → parse → reconcile → draft →
   adapter → filled form, and what persists locally along the way
4. **Catalog components** — List every component/module and what it owns
5. **Extract the domain model** — What are the core entities? How do they relate?
6. **Note the refusals** — Which compliance values the tool declines to infer, and where
   that is enforced. Those matter more than the feature list.

### Phase 2: Generate README

Using ONLY what you found in the code (never invent or assume), produce a README with the exact structure below.

**Constraint**: Every claim must be backed by a file link. if you can't link it, leave it out.

---

# <ProjectName>

**Last verified**: YYYY-MM-DD (America/Los_Angeles)  
**Commit**: <git-sha>  
**Primary audience**: code reviewers, project managers

---

## 1. What Is This?

<3-5 sentences max. No marketing. No feature lists.>

- What does the application do?
- Who is it for?
- What problem does it solve?

---

## 2. Project Structure

### Directory Layout

```text
<repo-root>/
  <dir>/                 # one-line purpose
  <dir>/                 # one-line purpose
  ...
```

### Where to Find Things

| To change...  | Look in...       |
| ------------- | ---------------- |
| <common task> | `<path/to/file>` |
| <common task> | `<path/to/file>` |

### Environment Requirements

FormWaypoint reads no environment variables and calls no external service: no API, no
database, no auth, no keys. If that ever stops being true, this section is where it gets
recorded — and per rule 00, it is a product decision before it is an implementation detail.

**Local inputs**

- <blank carrier form / dataset / imported file> -> <what it supplies> (`<path>`)

---

## 3. Core Concepts & Mental Model

<3-6 concepts. This is the highest ROI section. Focus on the _mental model_ (e.g., life cycles, hierarchies, state machines).
Each concept must include: (1) one paragraph explaining _why_ it exists (2) a Mermaid diagram derived from code (3) concrete code references.>

### 3.1 <Concept name>

<One paragraph: what it is + why it exists + how it shows up in the code. Include file paths.>

```mermaid
<erDiagram | graph TD | stateDiagram-v2>
```

**Repo evidence**

- `<path/to/file>` -> <symbol/function/component name>

### 3.2 <Concept name>

...

---

## 4. Architecture

### 4.1 Data Flow

<Describe how data moves through the system. Keep it concrete: UI -> state -> service -> persistence -> UI.>

```mermaid
flowchart LR
  A[User action] --> B[UI entry point<br/>`<path>`]
  B --> C[State owner<br/>`<path>`]
  C --> D[Service/API layer<br/>`<path>`]
  D --> E[Persistence<br/>DB/Auth/Storage]
  E --> D
  D --> C
  C --> B
  B --> F[Re-render / view update]
```

### 4.2 Component Responsibilities

| Component/Module | Responsibility          | Primary files      |
| ---------------- | ----------------------- | ------------------ |
| `<Name>`         | <what it owns and does> | `<path>`, `<path>` |

### 4.3 Local Persistence

There is no database. State lives in IndexedDB behind the `LocalStore` interface, which a
desktop build swaps for a file-backed implementation without touching callers.

| Store    | Purpose          | Key fields                      |
| -------- | ---------------- | ------------------------------- |
| `<name>` | <what it stores> | `<field>`, `<field>`, `<field>` |

**Constraints**

- <invariant> -> <how enforced> (code: `<path>`)

### 4.4 Trust Model

**What never leaves the machine**

- <data> -> <why no path off the machine exists> (code: `<path>`)

**What the tool refuses to infer**

- <compliance value> -> <what it does instead> (code: `<path>`)

**What gates generation**

- <blocking check> -> <what it proves against the source document> (code: `<path>`)

---

## 5. Current State

### 5.1 Working Features

- ✅ <feature> (evidence: `<path>`)
- ✅ <feature> (evidence: `<path>`)

### 5.2 Known Limitations

- ⚠️ <limitation> (symptom -> cause -> evidence: `<path>`)

### 5.3 Technical Debt (Brutal Honesty)

- <debt item> -> why it matters -> evidence: `<path>`

---

## Output Requirements

1. **Accuracy over completeness** — Only document what exists.
2. **Concrete references** — When describing patterns or components, reference actual file paths and function names.
3. **Diagrams must reflect code** — Every diagram must be derivable from the actual codebase.
4. **Evidence Rule** — If you can't cite a file path, you can't claim it.
5. **Honest current state** — The "Current State" section should be unflinching.
6. **Minimal prose** — Prefer tables, diagrams, and code blocks over paragraphs.
7. **No setup instructions** — This is not a "how to run" guide. It's a "how to understand" guide.
