import { existsSync } from 'node:fs';

import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env['CI'];

/**
 * The cookie that has the server hold back the models the sample room's pieces are drawn as, so they
 * are drawn as their pictures: see e2e/serve-dist.mjs. A spec about the models takes it off again.
 */
const withoutSampleModels = {
  name: 'axe-e2e-sample-models',
  value: 'off',
  domain: 'localhost',
  path: '/',
  expires: -1,
  httpOnly: false,
  secure: false,
  sameSite: 'Lax' as const,
};

/**
 * A browser set to play alone, which the connection panel calls offline: the page tries no connection
 * and the seat is who it is from the start. The suite has no backend to connect to, and a seat left
 * to try would fail and try again all through a spec, its user id new each time. A spec about the
 * connection itself takes this off again.
 */
const playsAlone = { name: 'ui-local-mode', value: '1' };

/** A browser set to play alone and nothing else. */
const alone = { cookies: [], origins: [{ origin: 'http://localhost:4300', localStorage: [playsAlone] }] };

/** A browser that draws the table on a canvas as a seat does by default, with the sample room's pieces drawn as their pictures. */
const drawsOnCanvasPictures = {
  cookies: [withoutSampleModels],
  origins: [{ origin: 'http://localhost:4300', localStorage: [playsAlone] }],
};

/**
 * A browser that has asked for the table not to be drawn at all: the table is worked through the page
 * and picking alone, as most specs do, and spends nothing on drawing a canvas in software.
 */
const drawsNothing = {
  cookies: [withoutSampleModels],
  origins: [
    { origin: 'http://localhost:4300', localStorage: [playsAlone, { name: 'axe.table.renderer', value: 'none' }] },
  ],
};

/** A browser that has asked for the table to be drawn on a canvas through three.js, as a seat does by default. */
const drawsOnCanvas = {
  cookies: [],
  origins: [
    { origin: 'http://localhost:4300', localStorage: [playsAlone, { name: 'axe.table.renderer', value: 'three' }] },
  ],
};

/**
 * A browser that has asked for the table to be drawn on a canvas through WebGL2, though it could draw
 * through WebGPU, with the sample room's pieces drawn as their pictures.
 */
const drawsThroughWebGl2 = {
  cookies: [withoutSampleModels],
  origins: [
    {
      origin: 'http://localhost:4300',
      localStorage: [playsAlone, { name: 'axe.table.renderer', value: 'three-webgl2' }],
    },
  ],
};

/**
 * How a browser that draws the table on a canvas is launched. Headless Chromium has no graphics card
 * to draw with and draws through SwiftShader; where Mesa's Vulkan driver for the processor
 * (llvmpipe) is installed, it is had to draw through that instead, which spreads the drawing over
 * the processor's cores and runs the canvas specs about a quarter faster.
 */
const CANVAS_LAUNCH = existsSync('/usr/share/vulkan/icd.d/lvp_icd.json')
  ? {
      args: ['--use-angle=vulkan', '--enable-features=Vulkan', '--ignore-gpu-blocklist'],
      env: { ...process.env, LP_NUM_THREADS: '4' },
    }
  : {};

/**
 * How a browser that draws the table through WebGPU is launched: headless Chromium gives SwiftShader's
 * stand-in adapter with these flags, and Vulkan is what puts a WebGPU canvas on the screen at all.
 */
const WEBGPU_LAUNCH = {
  args: [
    '--enable-unsafe-webgpu',
    '--enable-features=Vulkan',
    '--use-vulkan=swiftshader',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
  ],
};

/** The screen the pictures to compare with are taken on. */
const VISUAL_USE = {
  ...devices['Desktop Chrome'],
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
  colorScheme: 'light' as const,
  reducedMotion: 'no-preference' as const,
};

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 1,
  // The static server holds 77 MB where `ng serve` held 1.3 GB, so the run can
  // afford real parallelism. Each worker's browser takes about half a gigabyte:
  // 6 finish a run some 13% sooner than 4, and 8 hardly sooner than 6.
  workers: isCI ? 2 : 10,
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
    // A picture comes out a little different from run to run where software rounds a colour or
    // draws in another order, a few hundred pixels at the most; what moves or goes missing on the
    // table differs by far more. So a tenth of a percent of the picture may differ, and a colour by
    // as much as Playwright lets by default.
    toHaveScreenshot: { animations: 'allow', caret: 'hide', scale: 'css', maxDiffPixelRatio: 0.001, threshold: 0.2 },
  },
  projects: [
    // Every spec that works the table through the page and picking alone, with nothing drawn on the
    // canvas: drawing it in software is most of what a spec costs, and these look at none of it.
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: drawsNothing },
      testIgnore: [/mobile\/.*\.spec\.ts/, /visual\/.*\.spec\.ts/, /server\/.*\.spec\.ts/, /webgl\/.*\.spec\.ts/],
      timeout: 60000,
      workers: 8,
    },
    // The specs that look at the table drawn on a canvas, as a seat draws it. Headless Chromium gives
    // no WebGPU adapter without flags, so this goes through WebGL2, drawn in software: a spec that
    // drags a piece about many times takes a while, so each is given twice the time, and fewer run at
    // once.
    {
      name: 'chromium-webgl',
      use: { ...devices['Desktop Chrome'], launchOptions: CANVAS_LAUNCH, storageState: drawsOnCanvasPictures },
      testMatch: [/webgl\/.*\.spec\.ts/],
      timeout: 60000,
      workers: 4,
    },
    // The table drawn through WebGPU, only as far as it takes to know the scene comes up through it,
    // with the board where the camera puts it: SwiftShader draws WebGPU slower still than WebGL2,
    // everything else the canvas does is the same on both, and how WebGPU draws is held by the
    // pictures of the visual-webgpu project.
    {
      name: 'chromium-webgpu',
      use: {
        ...devices['Desktop Chrome'],
        storageState: { ...drawsOnCanvas, cookies: [withoutSampleModels] },
        launchOptions: WEBGPU_LAUNCH,
      },
      testMatch: [/webgl\/table-scene\.spec\.ts/],
      timeout: 60000,
      workers: 3,
    },
    // A phone, with the table not drawn: its specs look at the phone's layout and its touch, worked
    // through the page and picking, and at none of what the canvas draws.
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'], reducedMotion: 'reduce', storageState: drawsNothing },
      testMatch: [/mobile\/.*\.spec\.ts/],
      timeout: 60000,
    },
    // A phone with the table drawn on a canvas, as far as it takes to know the board is drawn where the
    // camera puts it on a screen of a phone's shape.
    {
      name: 'mobile-webgl',
      use: {
        ...devices['Pixel 7'],
        reducedMotion: 'reduce',
        launchOptions: CANVAS_LAUNCH,
        storageState: drawsOnCanvasPictures,
      },
      testMatch: [/webgl\/table-scene\.spec\.ts/],
      grep: /draws the board where the camera puts it/,
      timeout: 60000,
    },
    // The same pictures of the table drawn on a canvas, through WebGL2 and through WebGPU, each kept
    // in a folder of its own. SwiftShader draws WebGPU some three times slower than WebGL2, so a press
    // there is given longer to land, and fewer run at once: six together left a brush laid stroke by
    // stroke with the clock running, which draws the ground again at every step, past its time. Six
    // pages drawing WebGL2 in software at once left one not done laying its first scene after half a
    // minute, so four run at once there, as for the canvas specs.
    {
      name: 'visual-webgl2',
      use: { ...VISUAL_USE, storageState: drawsThroughWebGl2, launchOptions: CANVAS_LAUNCH },
      testMatch: /visual\/.*\.spec\.ts/,
      retries: 0,
      timeout: 60000,
      workers: 4,
      snapshotPathTemplate: '{testDir}/visual/__screenshots__/webgl2/{arg}{ext}',
    },
    {
      name: 'visual-webgpu',
      use: {
        ...VISUAL_USE,
        storageState: { ...drawsOnCanvas, cookies: [withoutSampleModels] },
        launchOptions: WEBGPU_LAUNCH,
        actionTimeout: 30000,
      },
      testMatch: /visual\/.*\.spec\.ts/,
      retries: 0,
      timeout: 120000,
      workers: 3,
      snapshotPathTemplate: '{testDir}/visual/__screenshots__/webgpu/{arg}{ext}',
    },
    // A room on the room server, played in several browsers against the backend's Worker. Run on
    // its own and locally, like the visual project: see e2e/server/room-server.ts for what it needs.
    // Each worker starts a Worker of its own beside its browsers, and six at once leave a seat that
    // joins a room waiting past its time on a busy machine; three finish sooner than six did.
    {
      name: 'server',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
      testMatch: /server\/.*\.spec\.ts/,
      retries: 0,
      timeout: 120_000,
      workers: 3,
    },
    // Firefox and WebKit are only run in CI to reduce local resource usage.
    ...(isCI
      ? [
          {
            name: 'firefox',
            use: { ...devices['Desktop Firefox'], storageState: alone },
            testIgnore: [/mobile\/.*\.spec\.ts/, /visual\/.*\.spec\.ts/, /server\/.*\.spec\.ts/],
          },
          {
            name: 'webkit',
            use: { ...devices['Desktop Safari'], storageState: alone },
            testIgnore: [/mobile\/.*\.spec\.ts/, /visual\/.*\.spec\.ts/, /server\/.*\.spec\.ts/],
          },
          {
            name: 'mobile-safari',
            use: { ...devices['iPhone 14'], reducedMotion: 'reduce', storageState: alone },
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
    // Asked over IPv6: under WSL's mirrored networking a connection to a closed port on 127.0.0.1
    // is not refused but left to time out, which held every run up by two and a half minutes
    // before the server was even started. ::1 refuses at once, and the server listens on both.
    url: 'http://[::1]:4300',
    reuseExistingServer: !isCI,
  },
});
