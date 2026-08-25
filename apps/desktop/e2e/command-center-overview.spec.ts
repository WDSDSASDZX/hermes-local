import { expect, test } from './test'

import { type MockBackendFixture, setupMockBackend, waitForAppReady } from './fixtures'
import { expectVisualSnapshot } from './visual-snapshot'

let fixture: MockBackendFixture | null = null

test.beforeAll(async () => {
  fixture = await setupMockBackend()
  await waitForAppReady(fixture, 120_000)
})

test.afterAll(async () => {
  await fixture?.cleanup()
  fixture = null
})

test.describe('control center overview', () => {
  test('opens from the status bar and presents the agent workspaces', async () => {
    const page = fixture!.page

    await page.getByRole('button', { name: 'Open Command Center' }).click()

    await expect(page.getByRole('heading', { name: 'Your agent workspace, at a glance' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Task board/ })).toBeEnabled()
    await expect(page.getByRole('button', { name: /Agent studio/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Model routing/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Live runs/ })).toBeVisible()
    await expect(page.getByRole('main').getByText('Gateway', { exact: true })).toBeVisible()
    await expect(page.getByText('Fallback routes', { exact: true })).toBeVisible()

    await expectVisualSnapshot(page, {
      app: fixture!.app,
      name: 'control-center-overview'
    })
  })

  test('opens the task board from the overview', async () => {
    const page = fixture!.page

    if (!page.url().includes('/command-center')) {
      await page.getByRole('button', { name: 'Open Command Center' }).click()
    }

    await page.getByRole('button', { name: /Task board/ }).click()

    await expect.poll(() => page.url()).toContain('/kanban')
    await expect(page.getByRole('heading', { name: 'Kanban' })).toBeVisible()
  })
  test('fits a compact desktop window without horizontal overflow', async () => {
    const { app, page } = fixture!

    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]

      win?.setMinimumSize(640, 620)
      win?.setSize(680, 700, false)
    })
    await page.waitForTimeout(300)

    if (!page.url().includes('/command-center')) {
      await page.getByRole('button', { name: 'Open Command Center' }).click()
    }

    await expect(page.getByRole('heading', { name: 'Your agent workspace, at a glance' })).toBeVisible()
    const horizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    )

    expect(horizontalOverflow).toBeLessThanOrEqual(1)
    await page.screenshot({
      animations: 'disabled',
      caret: 'hide',
      path: test.info().outputPath('control-center-compact-actual.png')
    })
  })
})
