import { test, expect, Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wait for the Angular app to be stable (checks for the header). */
async function waitForApp(page: Page) {
  await page.goto('/');
  await expect(page.locator('h1')).toContainText('ngx-api-forms');
}

// ---------------------------------------------------------------------------
// Interactive Demo -- simulate API errors on a form
// ---------------------------------------------------------------------------

test.describe('Interactive demo', () => {
  test.beforeEach(async ({ page }) => {
    await waitForApp(page);
  });

  test('simulate class-validator errors and verify field errors appear', async ({ page }) => {
    const simulateBtn = page.locator('button', { hasText: 'Simulate API Error' });
    await simulateBtn.click();

    // Errors should appear next to field inputs via ngxFormError directive
    const emailError = page.locator('#email ~ .field-error');
    await expect(emailError).not.toBeEmpty();

    const nameError = page.locator('#name ~ .field-error');
    await expect(nameError).not.toBeEmpty();

    // hasErrors signal should show true
    const section = page.locator('.demo-section').filter({ has: page.locator('#email') });
    await expect(section.locator('text=hasErrors')).toBeVisible();
  });

  test('clear errors removes field error messages', async ({ page }) => {
    await page.locator('button', { hasText: 'Simulate API Error' }).click();

    // Verify errors appeared
    await expect(page.locator('#email ~ .field-error')).not.toBeEmpty();

    // Clear
    await page.locator('button', { hasText: 'Clear Errors' }).click();

    // The directive should no longer show error text
    await expect(page.locator('#email ~ .field-error')).not.toContainText('email');
  });

  test('switch preset to Laravel and simulate errors', async ({ page }) => {
    await page.locator('select').first().selectOption('laravel');
    await page.locator('button', { hasText: 'Simulate API Error' }).click();

    await expect(page.locator('#email ~ .field-error')).not.toBeEmpty();
  });

  test('switch preset to Analog and simulate errors', async ({ page }) => {
    await page.locator('select').first().selectOption('analog');
    await page.locator('button', { hasText: 'Simulate API Error' }).click();

    await expect(page.locator('#email ~ .field-error')).not.toBeEmpty();
    await expect(page.locator('#name ~ .field-error')).not.toBeEmpty();
  });

  test('reset form clears errors and field values', async ({ page }) => {
    await page.locator('button', { hasText: 'Simulate API Error' }).click();
    await expect(page.locator('#email ~ .field-error')).not.toBeEmpty();

    await page.locator('button', { hasText: 'Reset Form' }).click();

    await expect(page.locator('#email')).toHaveValue('');
  });
});

// ---------------------------------------------------------------------------
// Live API Demo -- real HttpClient calls through interceptor
// ---------------------------------------------------------------------------

test.describe('Live API demo', () => {
  test.beforeEach(async ({ page }) => {
    await waitForApp(page);
    await page.locator('.live-api-demo').scrollIntoViewIfNeeded();
  });

  test('submit with invalid data shows validation errors via interceptor', async ({ page }) => {
    // Use data that passes Angular client validators but fails server validation
    // email must contain @ (Validators.email), username >= 3 (minLength), password >= 8 (minLength)
    // The mock API rejects emails not containing '@' and short usernames/passwords
    await page.fill('#live-email', 'x@y');
    await page.fill('#live-username', 'abc');
    await page.fill('#live-password', 'short123');

    await page.locator('.live-api-demo button', { hasText: 'Register' }).click();

    // Wait for mock API delay (~800ms) + rendering
    await expect(page.locator('.live-api-demo .field-error').first()).not.toBeEmpty({ timeout: 5000 });

    // Result text should confirm errors were applied
    await expect(page.locator('.live-api-demo').locator('text=Errors applied via')).toBeVisible({ timeout: 5000 });
  });

  test('submit with taken email shows global errors', async ({ page }) => {
    await page.fill('#live-email', 'taken@example.com');
    await page.fill('#live-username', 'johndoe');
    await page.fill('#live-password', 'password123');

    await page.locator('.live-api-demo button', { hasText: 'Register' }).click();

    // Wait for global errors to appear
    await expect(page.locator('.live-api-demo').locator('text=Global errors')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.live-api-demo').locator('text=Unable to create account')).toBeVisible();
  });

  test('submit valid data succeeds', async ({ page }) => {
    await page.fill('#live-email', 'new@example.com');
    await page.fill('#live-username', 'johndoe');
    await page.fill('#live-password', 'password123');

    await page.locator('.live-api-demo button', { hasText: 'Register' }).click();

    await expect(page.locator('.live-api-demo').locator('text=Success')).toBeVisible({ timeout: 5000 });
  });

  test('reset clears live form errors', async ({ page }) => {
    await page.fill('#live-email', 'x@y');
    await page.fill('#live-username', 'abc');
    await page.fill('#live-password', 'short123');
    await page.locator('.live-api-demo button', { hasText: 'Register' }).click();
    await expect(page.locator('.live-api-demo .field-error').first()).not.toBeEmpty({ timeout: 5000 });

    await page.locator('.live-api-demo button', { hasText: 'Reset' }).click();

    // Fields should be empty after reset
    await expect(page.locator('#live-email')).toHaveValue('');
  });
});

// ---------------------------------------------------------------------------
// Global Errors Demo
// ---------------------------------------------------------------------------

test.describe('Global errors demo', () => {
  test.beforeEach(async ({ page }) => {
    await waitForApp(page);
  });

  test('django non_field_errors appear as global errors', async ({ page }) => {
    const section = page.locator('.global-errors-demo');
    await section.scrollIntoViewIfNeeded();

    // Default is django preset
    await section.locator('button', { hasText: 'Simulate' }).first().click();

    // Check that result shows both globalErrors and the expected message
    await expect(section.locator('.result-json')).toContainText('globalErrors');
    await expect(section.locator('.result-json')).toContainText('Unable to log in');
  });
});

// ---------------------------------------------------------------------------
// Standalone Parsing Demo
// ---------------------------------------------------------------------------

test.describe('Standalone parsing', () => {
  test('parses errors without a form', async ({ page }) => {
    await waitForApp(page);

    const section = page.locator('.standalone-demo');
    await section.scrollIntoViewIfNeeded();

    await section.locator('button', { hasText: 'Parse Errors' }).click();

    // Result should show parsed errors JSON
    await expect(section.locator('.result-panel')).toContainText('constraint');
    await expect(section.locator('.result-panel')).toContainText('email');
  });
});
