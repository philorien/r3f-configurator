import { defineConfig, devices } from '@playwright/test'

const PORT = 4173

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  // Software-rendered WebGL is CPU heavy: on a small CI runner, parallel tests starve each other.
  workers: process.env.CI ? 1 : undefined,
  timeout: process.env.CI ? 90_000 : 30_000,
  expect: { timeout: process.env.CI ? 15_000 : 5_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/r3f-configurator/`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chrome',
      use: {
        ...devices['Desktop Chrome'],
        // Use the Chrome that's already installed (also preinstalled on GitHub's ubuntu runners)
        // instead of downloading a bundled Chromium.
        channel: 'chrome',
        // Software GL so WebGL works in headless runs without a GPU.
        launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
      },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/r3f-configurator/`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
