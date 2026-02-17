/**
 * Canvas e2e tests (uses anonymous auth via VITE_E2E_MODE)
 *
 * These tests verify the main canvas page after login:
 * - Dashboard loads with "New Board" button
 * - Canvas page shows toolbar and header
 * - Basic canvas interactions (shape creation via click-drag on Konva canvas)
 *
 * Note on canvas testing: react-konva renders to HTML Canvas, so shapes
 * are NOT in the DOM. We use screenshots for visual verification and test
 * the surrounding UI (toolbar, header) via DOM assertions.
 */

import { test, expect } from './fixtures'

test.describe('Dashboard (authenticated)', () => {
  test('shows New Board button after login', async ({ authenticatedPage: page }) => {
    const newBoardButton = page.getByRole('button', { name: 'New Board' })
    await expect(newBoardButton).toBeVisible()
  })

  test('dashboard screenshot', async ({ authenticatedPage: page }) => {
    await expect(page.getByRole('button', { name: 'New Board' })).toBeVisible()
    await expect(page).toHaveScreenshot('dashboard.png', {
      maxDiffPixelRatio: 0.05,
    })
  })
})

test.describe('Canvas Page (authenticated)', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    // Navigate to a new board
    await page.getByRole('button', { name: 'New Board' }).click()
    // The create board modal should appear — submit with default name
    await page.getByRole('button', { name: 'Create' }).click()
    // Wait for canvas to load — toolbar should appear
    await expect(page.getByRole('button', { name: 'Select' })).toBeVisible({ timeout: 10000 })
  })

  test('canvas page shows header with board title and sign out', async ({ authenticatedPage: page }) => {
    // Header should show CollabBoard breadcrumb
    await expect(page.getByText('CollabBoard')).toBeVisible()

    // Sign Out button should be present
    await expect(page.getByRole('button', { name: 'Sign Out' })).toBeVisible()
  })

  test('toolbar shows all shape tools', async ({ authenticatedPage: page }) => {
    // All 6 tools should be visible
    const expectedTools = ['Select', 'Rectangle', 'Circle', 'Line', 'Text', 'Sticky Note']
    for (const toolName of expectedTools) {
      await expect(page.getByRole('button', { name: toolName })).toBeVisible()
    }
  })

  test('select tool is active by default', async ({ authenticatedPage: page }) => {
    // The select button should have the "selected" styling
    const selectButton = page.getByRole('button', { name: 'Select' })
    await expect(selectButton).toHaveClass(/selected/)
  })

  test('clicking a tool changes the active tool', async ({ authenticatedPage: page }) => {
    const rectButton = page.getByRole('button', { name: 'Rectangle' })
    await rectButton.click()
    await expect(rectButton).toHaveClass(/selected/)

    // Select should no longer be selected
    const selectButton = page.getByRole('button', { name: 'Select' })
    await expect(selectButton).not.toHaveClass(/selected/)
  })

  test('canvas page screenshot (empty board)', async ({ authenticatedPage: page }) => {
    // Wait a moment for grid to render
    await page.waitForTimeout(500)

    await expect(page).toHaveScreenshot('canvas-empty-board.png', {
      maxDiffPixelRatio: 0.05,
    })
  })

  test('can create a rectangle via click-drag on canvas', async ({ authenticatedPage: page }) => {
    // Select rectangle tool
    await page.getByRole('button', { name: 'Rectangle' }).click()

    // The canvas is a Konva Stage — it's rendered in a <canvas> element
    const canvas = page.locator('canvas').first()
    await expect(canvas).toBeVisible()

    // Click-drag to create a rectangle (200x150 pixels)
    const canvasBox = await canvas.boundingBox()
    if (!canvasBox) throw new Error('Canvas not found')

    const startX = canvasBox.x + 200
    const startY = canvasBox.y + 200
    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(startX + 200, startY + 150, { steps: 5 })
    await page.mouse.up()

    // After creation, tool should switch back to select
    await expect(page.getByRole('button', { name: 'Select' })).toHaveClass(/selected/)

    // Take screenshot to verify shape was created
    await expect(page).toHaveScreenshot('canvas-with-rectangle.png', {
      maxDiffPixelRatio: 0.05,
    })
  })

  test('sign out returns to auth page', async ({ authenticatedPage: page }) => {
    await page.getByRole('button', { name: 'Sign Out' }).click()

    // Should return to the auth page
    await expect(page.getByText('Sign in to your account')).toBeVisible({ timeout: 10000 })
  })
})
