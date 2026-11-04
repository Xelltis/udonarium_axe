import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PieceMotionsService } from '@axe/application/tabletop/piece-motions.service';
import { MotionService } from '@axe/application/ui/motion.service';
import { motionLengthMs, motionPoseAt } from '@axe/domain/tabletop/world/piece-motions';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('PieceMotionsService', () => {
  let motions: PieceMotionsService;
  const enabled = signal(true);
  let now = 1000;
  let frames: FrameRequestCallback[] = [];

  function nextFrame(at: number): void {
    now = at;
    const due = frames;
    frames = [];
    for (const frame of due) frame(at);
  }

  beforeEach(() => {
    enabled.set(true);
    now = 1000;
    frames = [];
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((frame) => frames.push(frame));
    TestBed.configureTestingModule({ providers: [{ provide: MotionService, useValue: { enabled } }] });
    motions = TestBed.inject(PieceMotionsService);
  });

  afterEach(() => vi.restoreAllMocks());

  it('has a piece play a move from now, with the parts it moves, and says how long it plays', () => {
    expect(motions.play('die', 'dice-tumble-a', { parts: ['picture'] })).toBe(motionLengthMs('dice-tumble-a'));

    expect(motions.posesNow().get('die')).toMatchObject({ pose: { scale: 0.85, turnDeg: 0 }, parts: ['picture'] });
    expect(motions.isPlaying('die')).toBe(true);
  });

  it('moves the piece on as the frames go by, and lets it go once the move has played through', () => {
    motions.play('stack', 'shuffle');

    nextFrame(1000 + motionLengthMs('shuffle') / 2);
    expect(motions.posesNow().get('stack')!.pose.turnDeg).toBeCloseTo(360, 6);

    nextFrame(1000 + motionLengthMs('shuffle'));
    expect(motions.isPlaying('stack')).toBe(false);
    expect(frames).toEqual([]);
  });

  it('turns a piece on its own round and round, on top of a move it plays, until it stops', () => {
    const turning = { mode: 'continuous' as const, revolutionSeconds: 60, pauseSeconds: 0, phase: 0 };
    motions.turnOnItsOwn('piece', turning);
    nextFrame(15000);
    expect(motions.posesNow().get('piece')!.pose.turnDeg).toBeCloseTo(90, 6);

    motions.play('piece', 'shuffle');
    nextFrame(15000 + motionLengthMs('shuffle') / 2);
    expect(motions.posesNow().get('piece')!.pose.turnDeg).toBeCloseTo(360 + (15.4 / 60) * 360, 6);

    motions.turnOnItsOwn('piece', null);
    nextFrame(15000 + motionLengthMs('shuffle'));
    expect(motions.isPlaying('piece')).toBe(false);
    expect(frames).toEqual([]);
  });

  it('keeps a piece where a held move leaves it, until it is stopped', () => {
    motions.play('fallen', 'defeat-dissolve', { holds: true });
    nextFrame(1000 + motionLengthMs('defeat-dissolve') + 100);

    expect(motions.posesNow().get('fallen')!.pose.shown).toBe(0);
    expect(frames).toEqual([]);

    motions.stop('fallen');
    expect(motions.isPlaying('fallen')).toBe(false);
  });

  it('holds every move as far into it as asked, however the clock runs on, and plays it by the clock once let go', () => {
    motions.play('die', 'dice-tumble-a');
    nextFrame(1100);
    motions.play('coin', 'shuffle');
    const at250 = (kind: 'dice-tumble-a' | 'shuffle') => motionPoseAt(kind, 250);

    motions.holdAt(250);
    nextFrame(1000 + motionLengthMs('dice-tumble-a') * 4);
    expect(motions.posesNow().get('die')!.pose).toEqual(at250('dice-tumble-a'));
    expect(motions.posesNow().get('coin')!.pose).toEqual(at250('shuffle'));

    motions.holdAt(null);
    nextFrame(1000 + motionLengthMs('dice-tumble-a') * 5);
    expect(motions.isPlaying('die')).toBe(false);
  });

  it('plays nothing while motion is turned down', () => {
    enabled.set(false);

    expect(motions.play('coin', 'coin-flip', { backUp: true })).toBe(0);

    expect(motions.isPlaying('coin')).toBe(false);
    expect(frames).toEqual([]);
  });
});
