import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env['CI'];

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 1,
  // The static server holds 77 MB where `ng serve` held 1.3 GB, so the run can
  // afford real parallelism: 4 workers finish this suite in half the time of 2
  // and still use less memory in total than the old dev-server setup.
  workers: isCI ? 2 : 4,
  reporter: 'html',
  // A page load off the build settles in well under a second; 60s was sized for
  // the dev server compiling on demand.
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:4300',
    // Many assertions rely on the UI's wording, so the language is fixed
    locale: 'ja-JP',
    trace: 'on-first-retry',
    // Action/navigation timeouts to prevent indefinite hangs.
    actionTimeout: 10000,
    navigationTimeout: 15000,
  },
  snapshotPathTemplate: '{testDir}/visual/__screenshots__/{arg}{ext}',
  expect: {
    toHaveScreenshot: { animations: 'allow', caret: 'hide', scale: 'css' },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: [/mobile\/.*\.spec\.ts/, /visual\/.*\.spec\.ts/, /server\/.*\.spec\.ts/],
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'], reducedMotion: 'reduce' },
      testMatch: /mobile\/.*\.spec\.ts/,
    },
    {
      name: 'visual',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 1,
        colorScheme: 'light',
        reducedMotion: 'no-preference',
      },
      testMatch: /visual\/.*\.spec\.ts/,
      retries: 0,
    },
    // A room on the room server, played in several browsers against the backend's Worker. Run on
    // its own and locally, like the visual project: see e2e/server/room-server.ts for what it needs.
    {
      name: 'server',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
      testMatch: /server\/.*\.spec\.ts/,
      retries: 0,
      timeout: 120_000,
    },
    // Firefox and WebKit are only run in CI to reduce local resource usage.
    ...(isCI
      ? [
          {
            name: 'firefox',
            use: { ...devices['Desktop Firefox'] },
            testIgnore: [/mobile\/.*\.spec\.ts/, /visual\/.*\.spec\.ts/, /server\/.*\.spec\.ts/],
          },
          {
            name: 'webkit',
            use: { ...devices['Desktop Safari'] },
            testIgnore: [/mobile\/.*\.spec\.ts/, /visual\/.*\.spec\.ts/, /server\/.*\.spec\.ts/],
          },
          {
            name: 'mobile-safari',
            use: { ...devices['iPhone 14'], reducedMotion: 'reduce' },
            testMatch: /mobile\/.*\.spec\.ts/,
          },
        ]
      : []),
  ],
  webServer: {
    // The production build, not `ng serve` — see e2e/serve-dist.mjs. It listens
    // on its own port so a dev server left running on 4200 is never picked up
    // by mistake.
    command: 'npm run e2e:serve',
    url: 'http://localhost:4300',
    reuseExistingServer: !isCI,
  },
});
