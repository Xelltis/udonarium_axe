import { Logger } from '@axe/core/logging/logger';
import { trayFor } from '@axe/domain/dice/dice-3d/tray-size';
import type {
  DicePhysicsJob,
  DicePhysicsReply,
  DiceThrowRequest,
  DiceThrowResult,
} from '@axe/infrastructure/dice-3d/dice-physics-message';

/**
 * How long the worker is kept with nothing to do before it is let go, in milliseconds: long enough
 * to last between the rolls of a session, so a roll does not wait while the worker starts again.
 */
export const DICE_WORKER_IDLE_MS = 600_000;

/**
 * A small throw of every shape, worked out as the worker is started ahead of the rolls, so the
 * first roll finds the physics already run through once rather than still being readied to run.
 */
export const WARM_UP_THROW: DiceThrowRequest = {
  key: 'warm-up',
  shapes: ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'],
  targets: [0, 0, 0, 0, 0, 0],
  tray: trayFor(6, 3),
  edge: 'left',
  away: [0, 1, 0],
};

let makeWorker: (() => Worker | null) | null = null;
let worker: Worker | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let nextId = 1;
const pending = new Map<number, (result: DiceThrowResult | null) => void>();
/** Counts the times the worker has been swapped out, so a throw can tell it waited on one gone. */
let swaps = 0;

/**
 * Hands in how the worker is made, or null to go back to the real one. A test hands in a stand-in,
 * or one that makes none so the page works the throw out itself. Throws still waiting on the worker
 * swapped out are dropped rather than worked out on the page, so a test that held them leaves no
 * work behind to stall the next.
 */
export function useDicePhysicsWorkerFactory(factory: (() => Worker | null) | null): void {
  makeWorker = factory;
  swaps++;
  releaseWorker();
}

/**
 * Works out a throw away from the page, so a handful of dice tumbling for two seconds never
 * stutters the screen while they are worked out.
 *
 * The page works it out itself when no worker can be started or the worker fails, so a throw is
 * always answered; one left waiting on a worker swapped out is dropped instead.
 */
export async function throwDice(request: DiceThrowRequest): Promise<DiceThrowResult> {
  const asked = swaps;
  const fromWorker = await askWorker(request);
  if (fromWorker) return fromWorker;
  if (asked !== swaps) throw new Error('The worker the throw waited on was swapped out');
  const { simulateThrow } = await import('@axe/infrastructure/dice-3d/dice-physics');
  return simulateThrow(request);
}

/**
 * Starts the worker ahead of the first throw and has it work out a throw of its own, so the first
 * throw does not wait while the worker starts, loads the physics and first runs it.
 */
export function readyDicePhysics(): void {
  const started = !worker;
  const running = ensureWorker();
  if (!running) return;
  if (started) {
    try {
      running.postMessage({ id: nextId++, request: WARM_UP_THROW } satisfies DicePhysicsJob);
    } catch {
      // Left cold, the worker still works out the throws it is handed.
    }
  }
  scheduleIdle();
}

/** Lets the worker go and drops any throw still waiting on it, which the page then works out. */
export function releaseWorker(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  worker?.terminate();
  worker = null;
  for (const resolve of pending.values()) resolve(null);
  pending.clear();
}

function askWorker(request: DiceThrowRequest): Promise<DiceThrowResult | null> {
  const running = ensureWorker();
  if (!running) return Promise.resolve(null);
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, (result) => {
      pending.delete(id);
      scheduleIdle();
      resolve(result);
    });
    try {
      running.postMessage({ id, request } satisfies DicePhysicsJob);
    } catch (reason) {
      Logger.warn('[Dice3D] 物理のワーカーに投げられないためページで計算します', reason);
      pending.get(id)?.(null);
    }
  });
}

function ensureWorker(): Worker | null {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  if (worker) return worker;
  try {
    worker = startWorker();
  } catch (reason) {
    Logger.warn('[Dice3D] 物理のワーカーを起動できないためページで計算します', reason);
    worker = null;
  }
  if (!worker) return null;
  worker.addEventListener('message', (event: MessageEvent<DicePhysicsReply>) => {
    pending.get(event.data.id)?.(event.data.result);
  });
  worker.addEventListener('error', (event) => {
    Logger.warn('[Dice3D] 物理のワーカーが止まったためページで計算します', event);
    releaseWorker();
  });
  return worker;
}

function startWorker(): Worker | null {
  if (makeWorker) return makeWorker();
  if (typeof Worker === 'undefined') return null;
  return new Worker(new URL('./dice-physics.worker', import.meta.url), { type: 'module' });
}

function scheduleIdle(): void {
  if (idleTimer) clearTimeout(idleTimer);
  if (pending.size > 0) return;
  idleTimer = setTimeout(releaseWorker, DICE_WORKER_IDLE_MS);
}
