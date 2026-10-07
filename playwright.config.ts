import { defineConfig, devices } from '@playwright/test';

/**
 * Each concurrent run uses a distinct port offset (`PW_PORT_OFFSET`) so shared
 * dev servers and mock stores never bleed state between runs.
 */
const port_offset = Number(process.env['PW_PORT_OFFSET'] ?? 0);
const app_port = 4300 + port_offset;

/** The mandatory 8-project device matrix. */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${app_port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  globalSetup: './e2e/global_setup.ts',
  webServer: [
    {
      command: `npx ng serve --port ${app_port}`,
      url: `http://localhost:${app_port}`,
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      // The Auth emulator is shared by concurrent runs (its port is fixed in firebase.json and in
      // environment.ts); the suite only reads the seeded user from it, so sharing is safe.
      command: 'npx -y firebase-tools@15 emulators:start --only auth --project demo-assignr-helper',
      url: 'http://localhost:9099',
      reuseExistingServer: true,
      timeout: 180_000,
    },
  ],
  projects: [
    {
      name: 'desktop-standard',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } },
    },
    {
      name: 'desktop-full-hd',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } },
    },
    {
      name: 'tablet-portrait',
      use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 }, hasTouch: true },
    },
    {
      name: 'tablet-landscape',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 768 }, hasTouch: true },
    },
    { name: 'ios-safari-portrait', use: { ...devices['iPhone 14'] } },
    { name: 'ios-safari-landscape', use: { ...devices['iPhone 14 landscape'] } },
    { name: 'android-chrome-portrait', use: { ...devices['Pixel 7'] } },
    { name: 'android-chrome-landscape', use: { ...devices['Pixel 7 landscape'] } },
  ],
});
