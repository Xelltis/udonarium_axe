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

/** A browser that draws the table on a canvas as a seat does by default, with the sample room's pieces drawn as their pictures. */
const drawsOnCanvasPictures = { cookies: [withoutSampleModels], origins: [] };

/** A browser that has asked for the table to be drawn on a canvas through three.js, as a seat does by default. */
const drawsOnCanvas = {
  cookies: [],
  origins: [{ origin: 'http://localhost:4300', localStorage: [{ name: 'axe.table.renderer', value: 'three' }] }],
};

/**
 * A browser that has asked for the table to be drawn on a canvas through WebGL2, though it could draw
 * through WebGPU, with the sample room's pieces drawn as their pictures.
 */
const drawsThroughWebGl2 = {
  cookies: [withoutSampleModels],
  origins: [{ origin: 'http://localhost:4300', localStorage: [{ name: 'axe.table.renderer', value: 'three-webgl2' }] }],
};

/** A browser that has asked for the table to be drawn by the page itself, as a seat may until the page's table goes. */
const drawsOnPage = {
  cookies: [],
  origins: [{ origin: 'http://localhost:4300', localStorage: [{ name: 'axe.table.renderer', value: 'css' }] }],
};

/**
 * The specs about the table itself: what is drawn on it, where, and what a press on it does. The
 * page's own table is put through these alone, besides the canvas every spec runs on; the rest (the
 * chat, the panels, the novel screen and so on) do the same whichever way the table is drawn. A new
 * spec about the table goes on this list.
 */
const ON_THE_TABLE = [
  /e2e\/webgl\/.*\.spec\.ts$/,
  ...[
    'background-backdrop',
    'board-switch',
    'buff-view',
    'button-guide',
    'card',
    'card-advanced',
    'card-drop',
    'card-individual',
    'card-old-maid',
    'card-stack-more',
    'card-tcg',
    'character',
    'character-flags',
    'character-gauge',
    'coin',
    'darkness',
    'dice-symbol-flags',
    'disclosure',
    'engagement-zone',
    'first-person-entry',
    'free-path-move',
    'gm-tools',
    'hex-pedestal',
    'line-of-fire',
    'map-effects',
    'move-interrupt',
    'over-resource',
    'piece-image-size',
    'piece-overlay',
    'range-area',
    'ride',
    'see-through',
    'speech-bubble-note-format',
    'start-room',
    'stealth',
    'strict-move',
    'table-cells-and-music',
    'table-drop-faces',
    'table-surfaces',
    'tabletop',
    'tabletop-altitude',
    'tabletop-misc',
    'tabletop-objects',
    'unseen-pieces',
  ].map((name) => new RegExp(`e2e/${name}\\.spec\\.ts$`)),
];

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

/**
 * The specs that read how the page itself draws the table, which a canvas draws instead, and so
 * have nothing to read there: what the page's blocks are picked by, how it gathers them, and how it
 * shades them in the dark, which a canvas does with its own lights.
 */
const PAGE_DRAWING_ONLY = [/table-pick\.spec\.ts/, /terrain-batch\.spec\.ts/, /terrain-darkness\.spec\.ts/];

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 1,
  // The static server holds 77 MB where `ng serve` held 1.3 GB, so the run can
  // afford real parallelism. Each worker's browser takes about half a gigabyte:
  // 6 finish a run some 13% sooner than 4, and 8 hardly sooner than 6.
  workers: isCI ? 2 : 6,
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
    // Every spec, with the table drawn on a canvas as a seat draws it by default. Headless Chromium
    // gives no WebGPU adapter without flags, so this goes through WebGL2, drawn in software: a spec
    // that drags a piece about many times takes some three times as long as on the page's own table,
    // so each is given twice the time, and fewer run at once.
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], launchOptions: CANVAS_LAUNCH, storageState: drawsOnCanvasPictures },
      testIgnore: [/mobile\/.*\.spec\.ts/, /visual\/.*\.spec\.ts/, /server\/.*\.spec\.ts/, ...PAGE_DRAWING_ONLY],
      timeout: 60000,
      workers: 4,
    },
    // The page's own table, put through the specs about the table, until it goes.
    {
      name: 'chromium-css',
      use: { ...devices['Desktop Chrome'], storageState: drawsOnPage },
      testMatch: [...ON_THE_TABLE, ...PAGE_DRAWING_ONLY],
      testIgnore: [/mobile\/.*\.spec\.ts/, /visual\/.*\.spec\.ts/, /server\/.*\.spec\.ts/, /webgl\/.*\.spec\.ts/],
    },
    // The table drawn through WebGPU: SwiftShader draws WebGPU slower still than WebGL2, so the specs
    // that drag a piece about many times are given the same time as on WebGL2, and fewer run at once.
    {
      name: 'chromium-webgpu',
      use: {
        ...devices['Desktop Chrome'],
        storageState: { ...drawsOnCanvas, cookies: [withoutSampleModels] },
        launchOptions: WEBGPU_LAUNCH,
      },
      testMatch: [/webgl\/.*\.spec\.ts/],
      timeout: 60000,
      workers: 3,
    },
    // A phone, with the table on a canvas. Of the specs about the canvas, only the one that does not
    // build on the table runs here, since a phone has no game master's toolbar to build with.
    {
      name: 'mobile',
      use: {
        ...devices['Pixel 7'],
        reducedMotion: 'reduce',
        launchOptions: CANVAS_LAUNCH,
        storageState: drawsOnCanvasPictures,
      },
      testMatch: [/mobile\/.*\.spec\.ts/, /webgl\/table-scene\.spec\.ts/],
      timeout: 60000,
    },
    // The pictures to compare with, of the page's own table until those of the canvas are agreed.
    {
      name: 'visual',
      use: { ...VISUAL_USE, storageState: drawsOnPage },
      testMatch: /visual\/.*\.spec\.ts/,
      retries: 0,
    },
    // The same pictures of the table drawn on a canvas, through WebGL2 and through WebGPU, each kept
    // in a folder of its own. SwiftShader draws WebGPU some three times slower than WebGL2, so a press
    // there is given longer to land.
    {
      name: 'visual-webgl2',
      use: { ...VISUAL_USE, storageState: drawsThroughWebGl2, launchOptions: CANVAS_LAUNCH },
      testMatch: /visual\/.*\.spec\.ts/,
      retries: 0,
      timeout: 60000,
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
    // Asked over IPv6: under WSL's mirrored networking a connection to a closed port on 127.0.0.1
    // is not refused but left to time out, which held every run up by two and a half minutes
    // before the server was even started. ::1 refuses at once, and the server listens on both.
    url: 'http://[::1]:4300',
    reuseExistingServer: !isCI,
  },
});
