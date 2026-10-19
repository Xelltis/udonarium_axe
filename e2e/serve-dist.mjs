#!/usr/bin/env node
/**
 * Serves the production build for the e2e run.
 *
 * The suite used to point at `ng serve`, which keeps the whole Angular compiler
 * resident (1.3 GB here) and hands the browser unbundled sources — 209 requests
 * and 26 MB for a single page load, paid again by every test. Serving `dist`
 * costs 77 MB and 47 requests for 8.6 MB, which is what let the worker count go
 * up rather than down.
 *
 * The backend config is served from here rather than from the build. `ng build`
 * leaves `assets/config.json` out, and without it the URL the SkyWay client
 * builds is invalid, so it retries in a tight loop — 31,495 console errors in
 * one page load, enough to starve the page and time out assertions. A syntactic
 * URL that nothing answers brings that down to 6 and keeps the run hermetic.
 */
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const distDir = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
const port = Number(process.env['E2E_PORT'] ?? 4300);
const index = join(distDir, 'index.html');

try {
  statSync(index);
} catch {
  console.error(`No build to serve at ${distDir}. Run \`ng build\` first (\`npm run e2e\` does).`);
  process.exit(1);
}

const contentTypes = new Map(
  Object.entries({
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.jpg': 'image/jpeg',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.mp3': 'audio/mpeg',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain; charset=utf-8',
    '.wav': 'audio/wav',
    '.webp': 'image/webp',
    '.woff2': 'font/woff2',
    '.xml': 'application/xml; charset=utf-8',
    '.zip': 'application/zip',
  })
);

/** Resolve a request to a file, falling back to index.html only for routes. */
function resolveFile(urlPath) {
  const wanted = join(distDir, normalize(decodeURIComponent(urlPath)));
  if (!wanted.startsWith(distDir)) return null;
  try {
    return statSync(wanted).isDirectory() ? join(wanted, 'index.html') : wanted;
  } catch {
    // A missing asset stays a 404 so a broken reference still shows up as one;
    // only extension-less paths are treated as client-side routes.
    return extname(wanted) === '' ? index : null;
  }
}

/**
 * Nothing listens on port 9; the suite never wants a real backend. The room server project hands
 * its own config in E2E_CONFIG, pointing at the room server it started.
 */
const e2eConfig =
  process.env['E2E_CONFIG'] ?? JSON.stringify({ backend: { url: 'http://localhost:9/e2e-no-backend' } }, null, 2);

createServer((request, response) => {
  const path = request.url.split('?')[0];
  if (path === '/assets/config.json') {
    response.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(e2eConfig),
      'Cache-Control': 'no-store',
    });
    response.end(request.method === 'HEAD' ? undefined : e2eConfig);
    return;
  }
  const file = resolveFile(path);
  let size;
  try {
    size = file ? statSync(file).size : null;
  } catch {
    size = null;
  }
  if (size == null) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('not found');
    return;
  }
  response.writeHead(200, {
    'Content-Type': contentTypes.get(extname(file)) ?? 'application/octet-stream',
    'Content-Length': size,
    'Cache-Control': 'no-store',
  });
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  createReadStream(file).pipe(response);
}).listen(port, () => console.log(`e2e static server: ${distDir} on http://localhost:${port}`));
