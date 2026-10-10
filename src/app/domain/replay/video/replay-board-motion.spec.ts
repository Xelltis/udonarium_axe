import { replayPieceStateAt, STILL_PIECE } from '@axe/domain/replay/video/replay-board-motion';
import type { ReplayMotion } from '@axe/domain/replay/video/replay-video-timeline';

function motion(kind: ReplayMotion['kind'], startMs: number, more: Partial<ReplayMotion> = {}): ReplayMotion {
  return { kind, targetId: 'p', startMs, durationMs: 1000, route: [], fromAngle: 0, toAngle: 0, ...more };
}

const route = (x0: number, x1: number) => [
  { x: x0, y: 0, z: 0 },
  { x: x1, y: 0, z: 0 },
];

describe('how a piece stands in a beat of the board', () => {
  it('stands still with nothing happening to it', () => {
    expect(replayPieceStateAt([], 500)).toEqual(STILL_PIECE);
  });

  it('waits where a move starts, goes along it, and ends where the board has it', () => {
    const moves = [motion('path', 200, { route: route(0, 100) })];

    expect(replayPieceStateAt(moves, 0).position).toEqual({ x: 0, y: 0 });
    expect(replayPieceStateAt(moves, 700).position).toEqual({ x: 50, y: 0 });
    expect(replayPieceStateAt(moves, 1200).position).toBeNull();
  });

  it('goes from one move to the next, waiting where the first left it', () => {
    const moves = [motion('path', 0, { route: route(0, 100) }), motion('path', 2000, { route: route(100, 300) })];

    expect(replayPieceStateAt(moves, 1500).position).toEqual({ x: 100, y: 0 });
    expect(replayPieceStateAt(moves, 2500).position).toEqual({ x: 200, y: 0 });
  });

  it('is unseen until it arrives, then fades in', () => {
    const arrives = [motion('arrive', 500)];

    expect(replayPieceStateAt(arrives, 0).alpha).toBe(0);
    expect(replayPieceStateAt(arrives, 1000).alpha).toBeCloseTo(0.5, 5);
    expect(replayPieceStateAt(arrives, 2000).alpha).toBe(1);
  });

  it('fades out as it leaves and stays gone', () => {
    const leaves = [motion('depart', 0)];

    expect(replayPieceStateAt(leaves, 500).alpha).toBeCloseTo(0.5, 5);
    expect(replayPieceStateAt(leaves, 1500).alpha).toBe(0);
  });

  it('shows its old face until it is halfway over', () => {
    const flips = [motion('flip', 0)];

    expect(replayPieceStateAt(flips, 200).showsBefore).toBe(true);
    expect(replayPieceStateAt(flips, 500).scaleX).toBeCloseTo(0, 5);
    expect(replayPieceStateAt(flips, 800).showsBefore).toBe(false);
  });

  it('swings round to its new angle', () => {
    const turns = [motion('spin', 0, { fromAngle: 0, toAngle: 90 })];

    expect(replayPieceStateAt(turns, 500).rotate).toBeCloseTo(45, 5);
    expect(replayPieceStateAt(turns, 1500).rotate).toBeNull();
  });

  it('shakes while it rolls and settles after', () => {
    const rolls = [motion('shake', 0)];

    expect(Math.abs(replayPieceStateAt(rolls, 130).shakeAngle)).toBeGreaterThan(0);
    expect(replayPieceStateAt(rolls, 1500).shakeAngle).toBe(0);
  });
});
