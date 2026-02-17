/**
 * Playwright test fixtures for CollabBoard e2e tests
 *
 * Provides an `authenticatedPage` fixture that logs in via the UI before each test.
 * Uses a dedicated test account — create one in Firebase Console or via the app's
 * signup flow. Set these env vars before running authenticated tests:
 *
 *   E2E_TEST_EMAIL=test@example.com
 *   E2E_TEST_PASSWORD=testpassword123
 *
 * If the env vars are not set, authenticated tests will be skipped.
 *
 * Why a real login instead of mocking?
 * - Firebase Auth uses IndexedDB, not simple cookies — hard to fake
 * - Real login tests the full auth flow end-to-end
 * - The login is fast (<2s) since it's just email/password
 */

import { test as base, expect, type Page } from '@playwright/test'

export const TEST_EMAIL = process.env.E2E_TEST_EMAIL || ''
export const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD || ''
export const HAS_TEST_CREDENTIALS = !!(TEST_EMAIL && TEST_PASSWORD)

/**
 * Log in via the auth page UI. Waits for the dashboard to appear.
 */
async function loginViaUI(page: Page, email: string, password: string) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'CollabBoard' })).toBeVisible()

  await page.locator('#email').fill(email)
  await page.locator('#password').fill(password)
  await page.getByRole('button', { name: 'Sign In' }).click()

  // Wait for auth to complete — dashboard shows "New Board" button
  await expect(page.getByRole('button', { name: 'New Board' })).toBeVisible({ timeout: 10000 })
}

/**
 * Extended test fixture that provides a pre-authenticated page.
 * Tests using this fixture will be skipped if E2E_TEST_EMAIL/PASSWORD are not set.
 */
export const test = base.extend<{ authenticatedPage: Page }>({
  authenticatedPage: async ({ page }, use) => {
    if (!HAS_TEST_CREDENTIALS) {
      // Can't skip from fixture, but tests should use test.skip() check
      await use(page)
      return
    }
    await loginViaUI(page, TEST_EMAIL, TEST_PASSWORD)
    await use(page)
  },
})

export { expect }
