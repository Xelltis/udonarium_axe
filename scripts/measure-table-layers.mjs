#!/usr/bin/env node
/**
 * Measures how heavy the table is to draw, in a Chrome that really draws it.
 *
 * Headless and WSLg Chromium rasterise in software, where a hex dungeon draws a frame every few
 * seconds, so the numbers that matter only come from a desktop Chrome with its GPU. Start one with
 * a profile of its own and a debugging port, and point this script at it:
 *
 *   chrome.exe --remote-debugging-port=9224 --user-data-dir=C:\Temp\axe-profile
 *   node scripts/measure-table-layers.mjs --cdp http://127.0.0.1:9224 \
 *     --target main=4301 --target branch=4300 --rounds 3
 *
 * Each target is a port serving a production build. For every target, in turn and alternating
 * the order each round, the script opens a tab, builds the same generated dungeon, counts the
 * compositing layers and elements, and moves the camera along the same circle twice: once
 * panning and once turning. Machine drift lands on every target alike, and the medians are
 * printed at the end.
 */
import { chromium } from '@playwright/test';

function argsOf(argv) {
  const options = {
    cdp: 'http://127.0.0.1:9224',
    targets: [],
    rounds: 3,
    grid: 'hex-flat',
    rooms: 8,
    seed: '1278372739',
  };
  for (let i = 2; i < argv.length; i += 2) {
    const [flag, value] = [argv[i], argv[i + 1]];
    if (flag === '--cdp') options.cdp = value;
    else if (flag === '--target') {
      const [label, port] = value.split('=');
      options.targets.push({ label, port: Number(port) });
    } else if (flag === '--rounds') options.rounds = Number(value);
    else if (flag === '--grid') options.grid = value;
    else if (flag === '--rooms') options.rooms = Number(value);
    else if (flag === '--seed') options.seed = value;
    else throw new Error(`Unknown flag ${flag}`);
  }
  if (options.targets.length < 1) throw new Error('Give at least one --target label=port');
  return options;
}

const GRID_LABELS = { square: '四角', 'hex-flat': 'ヘクス（縦）', 'hex-pointy': 'ヘクス（横）' };

async function typeInto(input, text) {
  await input.click({ force: true });
  await input.press('Control+a');
  await input.pressSequentially(text);
}

/** The offer to restore the last table sits over the GM toolbar and takes its clicks. */
async function dismissRestoreOffer(page) {
  const later = page.locator('app-room-restore-banner button', { hasText: 'あとで' });
  for (let tries = 0; tries < 10; tries++) {
    if (await later.count()) {
      await later.first().dispatchEvent('click');
      return;
    }
    await page.waitForTimeout(300);
  }
}

async function buildDungeon(page, options) {
  await page.waitForSelector('#app-game-table', { timeout: 90000 });
  await dismissRestoreOffer(page);
  const connection = page.locator('ui-panel').filter({ hasText: '接続情報' });
  await connection.getByRole('button', { name: /^\s*GM\s*$/ }).click({ force: true });
  await page.locator('app-gm-toolbar button').first().waitFor({ timeout: 30000 });
  await page.locator('app-gm-toolbar').getByRole('button', { name: 'マップ生成' }).click({ force: true });
  const panel = page.locator('ui-panel').filter({ hasText: 'マップ生成' });
  await panel.getByRole('button', { name: GRID_LABELS[options.grid] }).click({ force: true });
  await typeInto(panel.locator('input[name="room-count-number"]'), String(options.rooms));
  await typeInto(panel.locator('#seed'), options.seed);
  await panel.getByRole('button', { name: '生成する' }).click({ force: true });
  const goTo = panel.getByRole('button', { name: 'このテーブルへ移動' });
  await goTo.waitFor({ timeout: 300000 });
  await goTo.click({ force: true });
  const panels = page.locator('ui-panel');
  for (let round = 0; round < 10 && (await panels.count()) > 0; round++) {
    await panels.first().locator('.bg-ui-titlebar button', { hasText: 'close' }).dispatchEvent('click');
  }
  await dismissRestoreOffer(page);
  await page.waitForTimeout(3000);
}

/** Moves the camera along a circle for a while and reports how the frames came. Runs in the page. */
function driveCamera([seconds, button]) {
  const root = document.getElementById('app-game-table');
  const board = root.parentElement;
  const focused = document.activeElement;
  if (focused && focused !== document.body && typeof focused.blur === 'function') focused.blur();
  const cx = Math.round(innerWidth / 2);
  const cy = Math.round(innerHeight / 2);
  const radius = Math.round(Math.min(innerWidth, innerHeight) / 6);
  const fire = (type, x, y, target) =>
    target.dispatchEvent(
      new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: Math.round(x),
        clientY: Math.round(y),
        button,
        buttons: button === 2 ? 2 : 1,
      })
    );
  const before = getComputedStyle(board).transform;
  return new Promise((resolve) => {
    const frames = [];
    const started = performance.now();
    let last = started;
    fire('mousedown', cx + radius, cy, root);
    const tick = (now) => {
      frames.push(now - last);
      last = now;
      const t = (now - started) / 1000;
      if (t < seconds) {
        const a = t * Math.PI;
        fire('mousemove', cx + radius * Math.cos(a), cy + radius * Math.sin(a), document);
        requestAnimationFrame(tick);
        return;
      }
      fire('mouseup', cx + radius, cy, document);
      const sorted = frames.slice(1).sort((x, y) => x - y);
      const at = (f) => +(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * f))] || 0).toFixed(1);
      resolve({
        fps: +((sorted.length / (now - started)) * 1000).toFixed(1),
        p50: at(0.5),
        p95: at(0.95),
        moved: getComputedStyle(board).transform !== before,
      });
    };
    requestAnimationFrame(tick);
  });
}

async function metricsOf(cdp) {
  const { metrics } = await cdp.send('Performance.getMetrics');
  return Object.fromEntries(metrics.map((m) => [m.name, m.value]));
}

async function scene(page, cdp, button) {
  const before = await metricsOf(cdp);
  const frames = await page.evaluate(driveCamera, [6, button]);
  const after = await metricsOf(cdp);
  const ms = (key) => Math.round((after[key] - before[key]) * 1000);
  return { ...frames, taskMs: ms('TaskDuration'), scriptMs: ms('ScriptDuration') };
}

async function layersOf(cdp) {
  await cdp.send('LayerTree.enable');
  const layers = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve([]), 30000);
    cdp.on('LayerTree.layerTreeDidChange', (event) => {
      if (!event.layers || event.layers.length < 2) return;
      clearTimeout(timer);
      resolve(event.layers);
    });
  });
  await cdp.send('LayerTree.disable');
  const pixels = layers.reduce((sum, layer) => sum + (layer.width || 0) * (layer.height || 0), 0);
  return { layers: layers.length, layerMegapixels: +(pixels / 1e6).toFixed(1) };
}

async function measure(browser, target, options) {
  const context = browser.contexts()[0];
  const page = await context.newPage();
  try {
    await page.bringToFront();
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`http://localhost:${target.port}/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
    await buildDungeon(page, options);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');
    const census = await page.evaluate(() => {
      const root = document.getElementById('app-game-table');
      return { terrains: root.querySelectorAll('terrain').length, elements: root.querySelectorAll('*').length };
    });
    const layers = await layersOf(cdp);
    const pan = await scene(page, cdp, 0);
    const rotate = await scene(page, cdp, 2);
    return { label: target.label, ...census, ...layers, pan, rotate };
  } finally {
    await page.close();
  }
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

const options = argsOf(process.argv);
const browser = await chromium.connectOverCDP(options.cdp);
const runs = [];
try {
  for (let round = 0; round < options.rounds; round++) {
    const order = round % 2 === 0 ? options.targets : [...options.targets].reverse();
    for (const target of order) {
      const run = await measure(browser, target, options);
      runs.push(run);
      const brief = (s) =>
        `${s.fps}fps p50 ${s.p50} p95 ${s.p95} task ${s.taskMs}ms script ${s.scriptMs}ms moved=${s.moved}`;
      console.log(
        `[round ${round + 1}] ${run.label}: terrains ${run.terrains} elements ${run.elements} layers ${run.layers} ` +
          `(${run.layerMegapixels}Mpx) | pan ${brief(run.pan)} | rotate ${brief(run.rotate)}`
      );
    }
  }
} finally {
  await browser.close().catch(() => {});
}

const summary = {};
for (const { label } of options.targets) {
  const mine = runs.filter((run) => run.label === label);
  const pick = (read) => median(mine.map(read));
  summary[label] = {
    terrains: pick((r) => r.terrains),
    elements: pick((r) => r.elements),
    layers: pick((r) => r.layers),
    layerMegapixels: pick((r) => r.layerMegapixels),
    pan: { fps: pick((r) => r.pan.fps), p95: pick((r) => r.pan.p95), taskMs: pick((r) => r.pan.taskMs) },
    rotate: { fps: pick((r) => r.rotate.fps), p95: pick((r) => r.rotate.p95), taskMs: pick((r) => r.rotate.taskMs) },
  };
}
console.log(JSON.stringify({ grid: options.grid, rooms: options.rooms, seed: options.seed, summary }, null, 2));
