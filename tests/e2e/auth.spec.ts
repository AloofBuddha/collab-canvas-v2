/**
 * Auth page e2e tests
 *
 * These tests verify the login/signup form renders correctly and validates input.
 * They do NOT actually authenticate against Firebase — that would require a real
 * test account or Firebase emulator. Instead, they test the UI layer: form fields,
 * validation, mode switching, and visual appearance.
 *
 * Why these tests matter:
 * - The auth page is the first thing every user sees — if it's broken, nobody gets in
 * - Form validation is easy to break when refactoring (field IDs, disabled states)
 * - Mode switching (login <-> signup) has caused bugs in V1
 */

import { test, expect } from '@playwright/test'

test.describe('Auth Page', () => {
  test('shows login form by default with correct fields', async ({ page }) => {
    await page.goto('/')

    // The app should show "CollabBoard" title
    await expect(page.getByRole('heading', { name: 'CollabBoard' })).toBeVisible()

    // Should show "Sign in to your account" subtitle
    await expect(page.getByText('Sign in to your account')).toBeVisible()

    // Login mode: email + password fields, no display name
    await expect(page.locator('#email')).toBeVisible()
    await expect(page.locator('#password')).toBeVisible()
    await expect(page.locator('#displayName')).not.toBeVisible()

    // Submit button should say "Sign In" and be disabled (empty form)
    const submitButton = page.getByRole('button', { name: 'Sign In' })
    await expect(submitButton).toBeVisible()
    await expect(submitButton).toBeDisabled()
  })

  test('enables submit button when email and password are filled', async ({ page }) => {
    await page.goto('/')

    await page.locator('#email').fill('test@example.com')
    await page.locator('#password').fill('password123')

    const submitButton = page.getByRole('button', { name: 'Sign In' })
    await expect(submitButton).toBeEnabled()
  })

  test('switches to signup mode and shows display name field', async ({ page }) => {
    await page.goto('/')

    // Click toggle to switch to signup
    await page.getByRole('button', { name: /Don't have an account/ }).click()

    // Subtitle should change
    await expect(page.getByText('Create your account')).toBeVisible()

    // Display name field should now be visible
    await expect(page.locator('#displayName')).toBeVisible()

    // Submit button should say "Sign Up"
    await expect(page.getByRole('button', { name: 'Sign Up' })).toBeVisible()
  })

  test('signup mode requires all three fields to enable submit', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /Don't have an account/ }).click()

    const submitButton = page.getByRole('button', { name: 'Sign Up' })

    // Only email filled — still disabled
    await page.locator('#email').fill('test@example.com')
    await expect(submitButton).toBeDisabled()

    // Email + password — still disabled (no display name)
    await page.locator('#password').fill('password123')
    await expect(submitButton).toBeDisabled()

    // All three filled — enabled
    await page.locator('#displayName').fill('Test User')
    await expect(submitButton).toBeEnabled()
  })

  test('can toggle back from signup to login mode', async ({ page }) => {
    await page.goto('/')

    // Switch to signup
    await page.getByRole('button', { name: /Don't have an account/ }).click()
    await expect(page.getByText('Create your account')).toBeVisible()

    // Switch back to login
    await page.getByRole('button', { name: /Already have an account/ }).click()
    await expect(page.getByText('Sign in to your account')).toBeVisible()
    await expect(page.locator('#displayName')).not.toBeVisible()
  })

  test('login page screenshot matches expected layout', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'CollabBoard' })).toBeVisible()

    // Take a screenshot for visual regression baseline
    await expect(page).toHaveScreenshot('auth-login-page.png', {
      maxDiffPixelRatio: 0.05,
    })
  })

  test('signup page screenshot matches expected layout', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /Don't have an account/ }).click()
    await expect(page.getByText('Create your account')).toBeVisible()

    await expect(page).toHaveScreenshot('auth-signup-page.png', {
      maxDiffPixelRatio: 0.05,
    })
  })
})
