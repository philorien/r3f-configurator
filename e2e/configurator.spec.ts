import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const chairGlb = readFileSync('public/models/SheenChair.glb')

/** The viewer is lazy-loaded; hotspot buttons only exist once a model has actually rendered. */
const modelReady = (page: Page) => expect(page.getByRole('button', { name: /show details/i }).first()).toBeVisible({ timeout: 20_000 })

const cameraOf = async (page: Page) => (await page.locator('canvas').getAttribute('data-camera')) ?? ''
const vec = (s: string) => s.split(',').map(Number)
const distance = (a: string, b: string) => Math.hypot(...vec(a).map((n, i) => n - vec(b)[i]))

test.describe('viewer', () => {
  test('renders the default model and the controls', async ({ page }) => {
    await page.goto('./')
    await expect(page.getByRole('heading', { level: 1, name: 'Configurator' })).toBeVisible()
    await modelReady(page)
    await expect(page.locator('canvas')).toBeVisible()
    await expect(page.getByRole('radio', { name: 'Sneaker' })).toBeChecked()
  })

  test('can be orbited and zoomed from the keyboard', async ({ page }) => {
    await page.goto('./')
    await modelReady(page)
    await page.getByRole('checkbox', { name: 'Auto-rotate' }).uncheck()
    const canvas = page.locator('canvas')
    await canvas.focus()
    const before = await cameraOf(page)

    await canvas.press('ArrowRight')
    const rotated = await cameraOf(page)
    expect(distance(rotated, before)).toBeGreaterThan(0.1)

    await canvas.press('+')
    const zoomed = await cameraOf(page)
    expect(distance(zoomed, rotated)).toBeGreaterThan(0.1)

    await canvas.press('Home')
    await expect.poll(async () => distance(await cameraOf(page), before)).toBeLessThan(0.05)
  })

  test('hotspots open on click and close with Escape', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('checkbox', { name: 'Auto-rotate' }).uncheck()
    const dot = page.getByRole('button', { name: /toe box/i })
    await expect(dot).toBeVisible({ timeout: 20_000 })
    await dot.click()
    await expect(page.getByText('Reinforced toe cap.')).toBeVisible()
    await expect(dot).toHaveAttribute('aria-expanded', 'true')
    await page.keyboard.press('Escape')
    await expect(page.getByText('Reinforced toe cap.')).toHaveCount(0)
    await page.getByRole('checkbox', { name: 'Hotspots' }).uncheck()
    await expect(dot).toHaveCount(0)
  })

  test('hides hotspots while the model is exploded', async ({ page }) => {
    await page.goto('./?m=chair')
    await expect(page.getByRole('button', { name: /seat/i })).toBeVisible({ timeout: 20_000 })
    await page.goto('./?m=chair&x=0.5')
    await expect(page.getByRole('radio', { name: 'Velvet chair' })).toBeChecked()
    await expect(page.getByRole('button', { name: /show details/i })).toHaveCount(0)
  })

  test('runs without console errors while switching models', async ({ page }) => {
    const problems: string[] = []
    page.on('pageerror', (e) => problems.push(e.message))
    page.on('console', (m) => m.type() === 'error' && problems.push(m.text()))
    await page.goto('./')
    await modelReady(page)
    await page.getByRole('radio', { name: 'Velvet chair' }).check()
    await page.getByRole('radio', { name: 'Sneaker' }).check()
    await modelReady(page)
    expect(problems).toEqual([])
  })

  test('switching variant and model updates the address bar', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('radio', { name: 'Velvet chair' }).check()
    await page.getByRole('radio', { name: 'Peacock Velvet' }).check()
    await expect(page).toHaveURL(/m=chair/)
    await expect(page).toHaveURL(/v=1/)
  })

  test('opens a shared link with the configuration applied', async ({ page }) => {
    await page.goto('./?m=chair&v=1&p=wood&env=dawn&x=0.5&o.wood=c:1d3557,h:1')
    await expect(page.getByRole('radio', { name: 'Velvet chair' })).toBeChecked()
    await expect(page.getByRole('radio', { name: 'Peacock Velvet' })).toBeChecked()
    await expect(page.getByRole('radio', { name: 'Wood' })).toBeChecked()
    await expect(page.getByLabel('Lighting')).toHaveValue('dawn')
    await expect(page.getByRole('checkbox', { name: 'Wood visible' })).not.toBeChecked()
    await expect(page.getByLabel('Custom')).toHaveValue('#1d3557')
    await expect(page.getByLabel('Shareable link')).toHaveValue(/m=chair.*v=1.*p=wood/)
  })

  test('ignores a hand-edited, malformed link and still loads', async ({ page }) => {
    await page.goto('./?m=chair&v=99&p=<img>&env=nope&o.fabric=c:javascript')
    await expect(page.getByRole('radio', { name: 'Velvet chair' })).toBeChecked()
    await expect(page.getByRole('radio', { name: 'Mango Velvet' })).toBeChecked()
    await modelReady(page)
  })
})

test.describe('uploads', () => {
  test('a picked .glb becomes a model with discovered parts and variants', async ({ page }) => {
    await page.goto('./')
    await page.getByTestId('glb-input').setInputFiles({ name: 'my-chair.glb', mimeType: 'model/gltf-binary', buffer: chairGlb })

    await expect(page.getByRole('radio', { name: 'my-chair' })).toBeChecked({ timeout: 20_000 })
    await expect(page.getByRole('radio', { name: 'SheenChair_fabric' })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('radio', { name: 'SheenChair_wood' })).toBeVisible()
    await expect(page.getByRole('radio', { name: 'Mango Velvet' })).toBeVisible()
    await expect(page.getByText(/can't be shared by link/)).toBeVisible()

    await page.getByRole('radio', { name: 'SheenChair_wood' }).check()
    await expect(page.getByRole('group', { name: /color: SheenChair_wood/i })).toBeVisible()

    await page.getByRole('button', { name: 'Remove upload' }).click()
    await expect(page.getByRole('radio', { name: 'Sneaker' })).toBeChecked()
    await expect(page.getByRole('radio', { name: 'my-chair' })).toHaveCount(0)
  })

  test('a .glb dropped on the viewer loads', async ({ page }) => {
    await page.goto('./')
    await modelReady(page)
    const dataTransfer = await page.evaluateHandle((b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      const dt = new DataTransfer()
      dt.items.add(new File([bytes], 'dropped.glb', { type: 'model/gltf-binary' }))
      return dt
    }, chairGlb.toString('base64'))
    const stage = page.locator('main.stage')
    await stage.dispatchEvent('dragenter', { dataTransfer })
    await expect(page.getByText('Drop a .glb file to view it')).toBeVisible()
    await stage.dispatchEvent('drop', { dataTransfer })
    await expect(page.getByRole('radio', { name: 'dropped' })).toBeChecked({ timeout: 20_000 })
  })

  test('rejects the wrong kind of file with a message', async ({ page }) => {
    await page.goto('./')
    await page.getByTestId('glb-input').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') })
    await expect(page.locator('p.error')).toContainText(/only \.glb files/i)
    await expect(page.getByRole('radio', { name: 'Sneaker' })).toBeChecked()
  })

  test('recovers when a file looks like a glb but is corrupt', async ({ page }) => {
    await page.goto('./')
    await modelReady(page)
    const corrupt = Buffer.concat([Buffer.from('glTF'), Buffer.alloc(64, 7)])
    await page.getByTestId('glb-input').setInputFiles({ name: 'broken.glb', mimeType: 'model/gltf-binary', buffer: corrupt })
    await expect(page.locator('p.error')).toContainText(/couldn't be loaded/i, { timeout: 20_000 })
    await expect(page.getByRole('radio', { name: 'Sneaker' })).toBeChecked()
    await expect(page.getByRole('radio', { name: 'broken' })).toHaveCount(0)
    await expect(page.getByRole('alert')).toHaveCount(0) // the viewer came back instead of staying on the error screen
  })
})

test.describe('accessibility', () => {
  const scan = (page: Page) => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()

  test('default view has no axe violations', async ({ page }) => {
    await page.goto('./')
    await modelReady(page)
    expect((await scan(page)).violations).toEqual([])
  })

  test('chair with part controls has no axe violations', async ({ page }) => {
    await page.goto('./?m=chair&p=wood')
    await modelReady(page)
    expect((await scan(page)).violations).toEqual([])
  })

  test('uploaded model with many parts has no axe violations', async ({ page }) => {
    await page.goto('./')
    await page.getByTestId('glb-input').setInputFiles({ name: 'my-chair.glb', mimeType: 'model/gltf-binary', buffer: chairGlb })
    await expect(page.getByRole('radio', { name: 'SheenChair_fabric' })).toBeVisible({ timeout: 20_000 })
    expect((await scan(page)).violations).toEqual([])
  })

  test('skip link is the first tab stop and moves focus to the controls', async ({ page }) => {
    await page.goto('./')
    await page.keyboard.press('Tab')
    const skip = page.getByRole('link', { name: 'Skip to controls' })
    await expect(skip).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.locator('#controls')).toBeFocused()
  })

  test('every control can be reached and operated with the keyboard', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('radio', { name: 'Sneaker' }).focus()
    await page.keyboard.press('ArrowRight') // native radio group arrow navigation
    await expect(page.getByRole('radio', { name: 'Velvet chair' })).toBeChecked()
    await page.getByRole('button', { name: 'Navy' }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('button', { name: 'Navy' })).toHaveAttribute('aria-pressed', 'true')
  })

  test('announces changes in a polite live region', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('radio', { name: 'Velvet chair' }).check()
    await page.getByRole('radio', { name: 'Peacock Velvet' }).check()
    await expect(page.locator('[aria-live="polite"]')).toHaveText('Variant: Peacock Velvet')
  })

  test('respects prefers-reduced-motion', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' })
    const page = await context.newPage()
    await page.goto('http://localhost:4173/r3f-configurator/')
    await expect(page.getByRole('checkbox', { name: 'Auto-rotate' })).not.toBeChecked()
    await context.close()
  })

  test('reflows at 320px wide without horizontal scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 })
    await page.goto('./')
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })
})
