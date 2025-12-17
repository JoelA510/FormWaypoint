# UI/UX Audit Issues

| Priority | Count |
| :--- | :--- |
| **P0** | 0 |
| **P1** | 0 |
| **P2** | 0 |

---

## Status Update (2025-11-28)
**All P0 and P1 issues have been resolved.** A visual polish pass (P2) has been completed for all major surfaces, improving shadows, transitions, and component states.

---

## Global & Shared Components

### Layout (`apps/web/src/App.jsx`)
- **Files**: `apps/web/src/App.jsx`
- **Issues**:
    - [FIXED] `keyboard_accessible` (P1): Logout button relies on `title` attribute.
        - *Fix*: Add `aria-label="Logout"` to the button.

### NotificationBell (`apps/web/src/components/common/NotificationBell.jsx`)
- **Files**: `apps/web/src/components/common/NotificationBell.jsx`
- **Issues**:
    - [FIXED] `keyboard_accessible` (P0): Dropdown items are `div`s with `onClick`. Not reachable via keyboard.
        - *Fix*: Change items to `<button>` or add `tabIndex="0"` and `onKeyDown` handler.
    - [FIXED] `focus_visible` (P1): Dropdown container does not manage focus.
        - *Fix*: Implement focus trap or move focus to first item on open.

### EditableField (`apps/web/src/components/common/EditableField.jsx`)
- **Files**: `apps/web/src/components/common/EditableField.jsx`
- **Issues**:
    - [FIXED] `forms_labels_visible` (P0): `label` element has no `htmlFor` and input has no `id`.
        - *Fix*: Generate a unique ID for the input and link the label with `htmlFor`.

## Document Review Flow

### DocumentReview (`apps/web/src/components/review/DocumentReview.jsx`)
- **Files**: `apps/web/src/components/review/DocumentReview.jsx`
- **Issues**:
    - [FIXED] `forms_labels_visible` (P0): Template selector, Reference Type/Value inputs have no associated labels (or no label at all).
        - *Fix*: Add `aria-label` or associate visible labels with `htmlFor`.
    - [FIXED] `keyboard_accessible` (P1): Back button and Remove Reference button rely on `title`.
        - *Fix*: Add `aria-label`.

### Comments (`apps/web/src/components/review/Comments.jsx`)
- **Files**: `apps/web/src/components/review/Comments.jsx`
- **Issues**:
    - [FIXED] `forms_labels_visible` (P0): Comment input has no label, only placeholder.
        - *Fix*: Add a visually hidden label or `aria-label`.
    - [FIXED] `keyboard_accessible` (P0): Send button has no text or `aria-label`.
        - *Fix*: Add `aria-label="Send comment"`.

### History (`apps/web/src/components/review/History.jsx`)
- **Files**: `apps/web/src/components/review/History.jsx`
- **Issues**:
    - No major P0/P1 issues found.

## Entry Points

### UploadZone (`apps/web/src/components/upload/UploadZone.jsx`)
- **Files**: `apps/web/src/components/upload/UploadZone.jsx`
- **Issues**:
    - [FIXED] `keyboard_accessible` (P0): File input is `hidden` (display: none), making it unreachable via keyboard.
        - *Fix*: Use `sr-only` (screen reader only) class or `opacity-0` absolute positioning instead of `hidden`.

### Login (`apps/web/src/components/auth/Login.jsx`)
- **Files**: `apps/web/src/components/auth/Login.jsx`
- **Issues**:
    - [FIXED] `forms_labels_visible` (P0): Inputs have visible labels but no `htmlFor`/`id` association.
        - *Fix*: Add `id` to inputs and `htmlFor` to labels.
