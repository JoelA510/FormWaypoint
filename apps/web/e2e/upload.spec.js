import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Document Upload', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');

        // Login first
        await page.getByPlaceholder(/username/i).fill('testuser');
        await page.getByPlaceholder(/password/i).fill('TestPass123!');
        await page.getByRole('button', { name: /login/i }).click();

        // Wait for main app
        await expect(page.getByText(/Shipping Doc Gen/i)).toBeVisible();
    });

    test('should display upload zone', async ({ page }) => {
        await expect(page.getByText(/drag.*drop/i)).toBeVisible();
    });

    test('should allow file upload', async ({ page }) => {
        // Create a test file upload
        const testFilePath = path.join(__dirname, 'fixtures', 'test-document.pdf');

        // Upload file (this would need file input to be visible or accept drop)
        const fileInput = page.locator('input[type="file"]');
        await fileInput.setInputFiles(testFilePath);

        // Verify processing starts
        await expect(page.getByText(/processing/i)).toBeVisible({ timeout: 5000 });
    });
});
