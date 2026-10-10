import { trayFor } from '@axe/domain/dice/dice-3d/tray-size';
import { simulateThrow } from '@axe/infrastructure/dice-3d/dice-physics';
import {
  DICE_WORKER_IDLE_MS,
  readyDicePhysics,
  releaseWorker,
  throwDice,
  useDicePhysicsWorkerFactory,
  WARM_UP_THROW,
} from '@axe/infrastructure/dice-3d/dice-physics-client';
import type { DicePhysicsJob, DiceThrowRequest } from '@axe/infrastructure/dice-3d/dice-physics-message';

const request: DiceThrowRequest = {
  key: 'client-roll',
  shapes: ['d6', 'd6'],
  targets: [2, 5],
  tray: trayFor(2, 2),
  edge: 'left',
  away: [0, 1, 0],
};

/** A worker that answers on the page, the way the real one does in its own thread. */
class StandInWorker extends EventTarget {
  posted: DicePhysicsJob[] = [];
  terminated = false;

  postMessage(job: DicePhysicsJob): void {
    this.posted.push(job);
    queueMicrotask(() =>
      this.dispatchEvent(new MessageEvent('message', { data: { id: job.id, result: simulateThrow(job.request) } }))
    );
  }

  terminate(): void {
    this.terminated = true;
  }
}

describe('throwDice', () => {
  afterEach(() => {
    vi.useRealTimers();
    useDicePhysicsWorkerFactory(null);
    releaseWorker();
  });

  it('has the worker work the throw out', async () => {
    const stand = new StandInWorker();
    useDicePhysicsWorkerFactory(() => stand as unknown as Worker);

    const result = await throwDice(request);

    expect(stand.posted).toHaveLength(1);
    expect(result.landed).toEqual(simulateThrow(request).landed);
  });

  it('keeps one worker for throw after throw', async () => {
    let started = 0;
    const stand = new StandInWorker();
    useDicePhysicsWorkerFactory(() => {
      started++;
      return stand as unknown as Worker;
    });

    await throwDice(request);
    await throwDice({ ...request, key: 'another' });

    expect(started).toBe(1);
    expect(stand.posted).toHaveLength(2);
  });

  it('starts the worker ahead of the first throw, warmed by a throw of its own, and has it work the first throw out', async () => {
    let started = 0;
    const stand = new StandInWorker();
    useDicePhysicsWorkerFactory(() => {
      started++;
      return stand as unknown as Worker;
    });

    readyDicePhysics();
    expect(started).toBe(1);
    expect(stand.posted.map((job) => job.request)).toEqual([WARM_UP_THROW]);

    const result = await throwDice(request);
    expect(started).toBe(1);
    expect(stand.posted.map((job) => job.request)).toEqual([WARM_UP_THROW, request]);
    expect(result.landed).toEqual(simulateThrow(request).landed);
  });

  it('warms a worker once, however often it is readied', () => {
    const stand = new StandInWorker();
    useDicePhysicsWorkerFactory(() => stand as unknown as Worker);

    readyDicePhysics();
    readyDicePhysics();

    expect(stand.posted).toHaveLength(1);
  });

  it('lets a worker started ahead go once it has long had nothing to do', () => {
    vi.useFakeTimers();
    const stand = new StandInWorker();
    useDicePhysicsWorkerFactory(() => stand as unknown as Worker);

    readyDicePhysics();
    vi.advanceTimersByTime(DICE_WORKER_IDLE_MS - 1);
    expect(stand.terminated).toBe(false);

    vi.advanceTimersByTime(1);
    expect(stand.terminated).toBe(true);
  });

  it('works the throw out on the page when no worker can be started', async () => {
    useDicePhysicsWorkerFactory(() => null);

    const result = await throwDice(request);

    expect(result.landed).toEqual(simulateThrow(request).landed);
  });

  it('works the throw out on the page when the worker cannot answer it', async () => {
    const failing = new StandInWorker();
    failing.postMessage = (job: DicePhysicsJob) =>
      queueMicrotask(() => failing.dispatchEvent(new MessageEvent('message', { data: { id: job.id, result: null } })));
    useDicePhysicsWorkerFactory(() => failing as unknown as Worker);

    const result = await throwDice(request);

    expect(result.frameCount).toBeGreaterThan(0);
  });

  it('drops a throw still waiting on a worker that is swapped out, rather than working it out on the page', async () => {
    const held = new StandInWorker();
    held.postMessage = () => undefined;
    useDicePhysicsWorkerFactory(() => held as unknown as Worker);
    const waiting = throwDice(request);

    useDicePhysicsWorkerFactory(() => null);

    await expect(waiting).rejects.toThrow();
  });

  it('lets a worker that stopped go, and answers the throw it was holding on the page', async () => {
    const dying = new StandInWorker();
    dying.postMessage = () => queueMicrotask(() => dying.dispatchEvent(new Event('error')));
    useDicePhysicsWorkerFactory(() => dying as unknown as Worker);

    const result = await throwDice(request);

    expect(dying.terminated).toBe(true);
    expect(result.frameCount).toBeGreaterThan(0);
  });
});
