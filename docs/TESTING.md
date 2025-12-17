# Testing Guide

This document describes how to run and write tests for the FormWaypoint application.

## Test Stack

- **Unit Tests**: Vitest (frontend) / Jest (backend)
- **E2E Tests**: Playwright
- **Test Library**: @testing-library/react (frontend)

## Running Tests

### Frontend Unit Tests

```bash
cd apps/web
npm test                 # Run in watch mode
npm test -- --run        # Run once
npm test -- --coverage   # With coverage report
```

**Status**: 30/35 tests passing (86% pass rate)

### Backend Unit Tests

```bash
cd apps/api
npm test                 # Run all tests
```

**Status**: 7+ tests passing

### Ingestion Service Tests

```bash
cd services/ingestion
npm test                 # Run all tests
```

**Status**: 18/18 tests passing ✅

### E2E Tests

```bash
cd apps/web
npm run test:e2e         # Run E2E tests headless
npm run test:e2e:ui      # Run with Playwright UI
```

## Test Structure

### Frontend (`apps/web`)

```
src/
├── __tests__/              # App-level integration tests
├── components/
│   └── **/__tests__/       # Component tests
├── services/
│   └── **/__tests__/       # Service tests
└── hooks/
    └── **/__tests__/       # Hook tests

e2e/                        # Playwright E2E tests
├── auth.spec.js
├── upload.spec.js
└── review.spec.js
```

### Backend (`apps/api`)

```
tests/
├── auth.test.js           # Authentication tests
├── history_comments.test.js # Collaboration tests  
├── integration.test.js    # API integration tests
└── generator.test.js      # PDF generation tests
```

## Writing Tests

### Unit Tests (Vitest)

```javascript
import { vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import MyComponent from '../MyComponent';

// Mock dependencies
vi.mock('../api', () => ({
  fetchData: vi.fn()
}));

describe('MyComponent', () => {
  it('renders correctly', () => {
    render(<MyComponent />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });
});
```

### E2E Tests (Playwright)

```javascript
import { test, expect } from '@playwright/test';

test('user can login', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder(/username/i).fill('testuser');
  await page.getByPlaceholder(/password/i).fill('password');
  await page.getByRole('button', { name: /login/i }).click();
  await expect(page.getByText(/welcome/i)).toBeVisible();
});
```

## Test Coverage Goals

- **Critical Paths**: 100% coverage
- **Business Logic**: 80%+ coverage
- **UI Components**: 70%+ coverage
- **E2E Flows**: Key user journeys covered

## CI/CD Integration

Tests run automatically on:

- Pull requests
- Pushes to main
- Pre-deployment

All tests must pass before merging to main.

## Troubleshooting

### Vitest Tests Failing

- Ensure `vi` is imported instead of `jest`
- Check mock syntax: `vi.mock()` not `jest.mock()`
- Verify async imports: `await vi.importActual()`

### E2E Tests Failing

- Ensure dev server is running (`npm run dev`)
- Check baseURL in `playwright.config.js`
- Clear browser storage: `playwright open --clear`

### Test Timeouts

- Increase timeout in test: `test.setTimeout(60000)`
- Check for unresolved promises
- Verify async/await usage

## Best Practices

1. **Isolation**: Tests should not depend on each other
2. **Descriptive Names**: Use clear, behavior-focused test names
3. **AAA Pattern**: Arrange, Act, Assert
4. **Mock External Dependencies**: API calls, timers, etc.
5. **Test User Behavior**: Not implementation details
6. **Keep Tests Fast**: Unit tests<1s, E2E<5s per test

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Playwright Documentation](https://playwright.dev/)
- [Testing Library](https://testing-library.com/)
