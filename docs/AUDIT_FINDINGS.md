# Project Audit & Health Check

**Date**: 2025-11-26
**Scope**: Full Stack (API, Web, Database)

## 🚨 Critical Issues (High Priority)

### 1. Security Vulnerabilities
*   **Dependencies**: `apps/api` has **4 vulnerabilities** (3 High, 1 Moderate).
    *   *Action*: Run `npm audit fix --force` immediately.
*   **Public File Access**: The `/files` directory is served statically without authentication (`apps/api/src/index.js`). Anyone with a file ID can access generated documents.
    *   *Action*: Implement a secure file serving route that checks ownership/permissions before streaming the file.

### 2. Database Performance
*   **Missing Indexes**: The database schema (`schema.prisma`) lacks indexes on foreign keys and frequently queried fields. This will cause slow queries as data grows.
    *   *Missing*: `DocumentTemplate(userId)`, `CarrierAccount(userId)`, `Notification(userId)`, `Shipment(documentId)`.
    *   *Action*: Add `@@index` to these fields in Prisma schema.

## ⚠️ Major Improvements (Medium Priority)

### 1. Frontend Architecture
*   **Routing**: The app uses conditional rendering (`view === 'upload'`) instead of a real router. This breaks browser history (back button) and deep linking.
    *   *Recommendation*: Migrate to `react-router-dom`.
*   **Auth Verification**: On load, the app checks for a token in `localStorage` but doesn't verify it with the server. If the token is expired/revoked, the user sees a logged-in state until an API call fails.
    *   *Recommendation*: Add a `/auth/me` endpoint and call it on app mount.

### 2. API Efficiency
*   **Notification Polling**: `NotificationBell.jsx` polls every 30 seconds, fetching the *entire* list of notifications.
    *   *Recommendation*: Implement pagination or `since` timestamp filtering, or switch to WebSockets for real-time updates.

## ℹ️ Minor Polish (Low Priority)

*   **Input Validation**: `auth.js` only checks for existence of username/password.
    *   *Recommendation*: Add length and complexity requirements (e.g., `zod` or `express-validator`).
*   **Code Quality**: `App.jsx` is growing large.
    *   *Recommendation*: Extract `Header` into its own component.

---

## Recommended Action Plan

1.  **Fix Security**: Update dependencies and secure the `/files` route.
2.  **Optimize DB**: Add missing indexes to Prisma schema.
3.  **Refactor Frontend**: Implement React Router and proper auth verification.
