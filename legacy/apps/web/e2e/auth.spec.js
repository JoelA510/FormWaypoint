import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('should show login screen on initial load', async ({ page }) => {
        await expect(page.getByText(/login/i)).toBeVisible();
    });

    test('should allow user registration', async ({ page }) => {
        // Click toggle to registration
        await page.getByText(/register/i).click();

        // Fill registration form
        await page.getByPlaceholder(/username/i).fill('testuser');
        await page.getByPlaceholder(/password/i).fill('TestPass123!');

        // Submit
        await page.getByRole('button', { name: /register/i }).click();

        // Should redirect to main app
        await expect(page.getByText(/Shipping Doc Gen/i)).toBeVisible();
    });

    test('should allow user login', async ({ page }) => {
        // Fill login form
        await page.getByPlaceholder(/username/i).fill('testuser');
        await page.getByPlaceholder(/password/i).fill('TestPass123!');

        // Submit
        await page.getByRole('button', { name: /login/i }).click();

        // Should show main app
        await expect(page.getByText(/Shipping Doc Gen/i)).toBeVisible();
        await expect(page.getByText(/Welcome/i)).toBeVisible();
    });

    test('should allow user logout', async ({ page }) => {
        // Login first
        await page.getByPlaceholder(/username/i).fill('testuser');
        await page.getByPlaceholder(/password/i).fill('TestPass123!');
        await page.getByRole('button', { name: /login/i }).click();

        // Wait for app to load
        await expect(page.getByText(/Welcome/i)).toBeVisible();

        // Logout
        await page.getByRole('button', { name: /logout/i }).click();

        // Should return to login screen
        await expect(page.getByText(/login/i)).toBeVisible();
    });
});
