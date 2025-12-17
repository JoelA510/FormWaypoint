You are Gemini 3 High Reasoning operating inside the Antigravity IDE on the Shipping-Doc-Gen repository.

Global constraints:
- You MUST follow docs/restructure/global-instructions.md for:
  - Code layout.
  - Schema and migration discipline.
  - Validation/compliance behavior.
  - Integrations, feature flags, and secrets.
  - Testing and documentation.

Task:
- Implement the following scoped change without drifting outside this scope:
  - {SHORT_DESCRIPTION_OF_CHANGE}
    - Example: "Add a new validation rule that warns when total customs value is zero on an international export."
    - Example: "Add a GET /api/shipments/:id/validation endpoint that returns the validation summary."

Requirements:
1) Place new logic in the correct module per global instructions.
2) Do not change schema unless absolutely necessary; if you must, follow the full schema/migration checklist.
3) Add or update tests that cover the new behavior.
4) Run lint, tests, and typecheck and keep them passing.
5) Update docs only if this change affects public APIs or user-visible behavior.

Output:
- A small, focused change set implementing {SHORT_DESCRIPTION_OF_CHANGE} in alignment with docs/restructure/global-instructions.md, with tests green.
