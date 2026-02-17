/**
 * Playwright test fixtures for CollabBoard e2e tests
 *
 * Provides an `authenticatedPage` fixture that signs in via Firebase
 * Anonymous Auth. No test credentials needed — the app exposes a
 * signInAnonymously function on window in dev mode (see auth.ts).
 *
 * This gives us a real Firebase auth session so all downstream features
 * (Yjs awareness, user identity, presence) work normally.
 */

import { test as base, expect, type Page } from '@playwright/test'

/**
 * Extended test fixture that provides a pre-authenticated page.
 * Uses Firebase Anonymous Auth — no email/password needed.
 */
export const test = base.extend<{ authenticatedPage: Page }>({
  authenticatedPage: async ({ page }, use) => {
    await page.goto('/')

    // Wait for the app to load and expose the anonymous sign-in function
    await page.waitForFunction(
      () => typeof (window as Record<string, unknown>).__collabboard_signInAnonymously === 'function',
      null,
      { timeout: 10000 },
    )

    // Trigger anonymous sign-in
    await page.evaluate(async () => {
      const fn = (window as Record<string, unknown>).__collabboard_signInAnonymously as () => Promise<unknown>
      await fn()
    })

    // Wait for auth to complete — dashboard shows "New Board" button
    await expect(page.getByRole('button', { name: 'New Board' })).toBeVisible({ timeout: 15000 })
    await use(page)
  },
})

export { expect }
