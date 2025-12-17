# UI/UX Audit Plan

## 1. Rules Summary

### P0 – Must Fix (Blockers)
- **Accessibility**: Contrast < 4.5:1, missing focus indicators, keyboard traps, small touch targets (< 24px).
- **Broken Flows**: Dead ends, unclosable modals, critical task failures.
- **Content**: Unreadable text (< 14px), clipped/overlapping content.
- **Forms**: Missing labels (placeholders != labels).

### P1 – Strongly Recommended
- **Layout**: Inconsistent spacing (use 4/8px scale), alignment issues.
- **Typography**: Undefined styles, poor hierarchy.
- **Components**: Inconsistent states (hover, focus, disabled), missing feedback (loading/success).
- **Navigation**: Unclear active state, unpredictable back behavior.
- **Tables**: Non-semantic markup, missing sort/filter indicators.

---

## 2. UI Surfaces & Risk Assessment

### Shared & Global (High Priority)
These affect the entire application and should be audited first to establish a baseline.

| Component | Path | Description | Risk |
|-----------|------|-------------|------|
| **Layout** | `apps/web/src/App.jsx` | Main app shell, header, navigation, user menu. | **MEDIUM** |
| **NotificationBell** | `apps/web/src/components/common/NotificationBell.jsx` | Notifications dropdown/popover. | **LOW** |
| **EditableField** | `apps/web/src/components/common/EditableField.jsx` | Inline editing component used in forms/tables. | **MEDIUM** |

### Core Workflows

#### Document Review (The "Meat")
This is the most complex part of the application.

| Component | Path | Description | Risk |
|-----------|------|-------------|------|
| **DocumentReview** | `apps/web/src/components/review/DocumentReview.jsx` | Main workspace for reviewing/editing docs. Likely contains complex forms and data displays. | **HIGH** |
| **Comments** | `apps/web/src/components/review/Comments.jsx` | Commenting system sidebar or section. | **LOW** |
| **History** | `apps/web/src/components/review/History.jsx` | Audit log or history view. | **LOW** |

#### Onboarding & Entry
Critical for first impressions.

| Component | Path | Description | Risk |
|-----------|------|-------------|------|
| **UploadZone** | `apps/web/src/components/upload/UploadZone.jsx` | Home screen. Drag-and-drop file upload interaction. | **MEDIUM** |
| **Login** | `apps/web/src/components/auth/Login.jsx` | Authentication form. | **LOW** |

---

## 3. Recommended Audit Order

1.  **Global & Shared**:
    - Audit `Layout` (Header, Nav) for responsiveness and accessibility.
    - Check `EditableField` as it's likely reused in the high-risk `DocumentReview`.
    - **Why**: Fixes here propagate everywhere.

2.  **Document Review (High Risk)**:
    - Deep dive into `DocumentReview.jsx`.
    - Focus on form accessibility, keyboard navigation, and data density (tables/grids).
    - Check `Comments` and `History` as part of this flow.
    - **Why**: This is where users spend 90% of their time.

3.  **Entry Points**:
    - Audit `UploadZone` (drag-and-drop accessibility is often tricky).
    - Quick pass on `Login`.
    - **Why**: Important for acquisition but usually simpler UI.

## 4. Execution Strategy
- **Tools**: Chrome DevTools (Lighthouse), keyboard-only navigation, screen reader (VoiceOver/NVDA) if possible.
- **Output**: Create a `docs/ui-ux-audit-findings.md` (or similar) logging P0/P1 issues found, grouped by component.
