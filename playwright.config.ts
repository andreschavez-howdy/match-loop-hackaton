import { defineConfig, devices } from '@playwright/test'

// npm run loop:watch (LOOP_HEADED=1) runs e2e in a real, visible browser
// window for recording/demo purposes -- slow the actions down so a human can
// actually follow along, instead of the normal full-speed headless run.
const HEADED = process.env.LOOP_HEADED === '1'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    launchOptions: HEADED ? { slowMo: 400 } : {},
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
