import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PieceMotionsService } from '@axe/application/tabletop/piece-motions.service';
import { MotionService } from '@axe/application/ui/motion.service';
import { motionLengthMs } from '@axe/domain/tabletop/world/piece-motions';
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

  it('has a piece play a move from now, with the parts it moves', () => {
    motions.play('die', 'dice-tumble-a', { parts: ['picture'] });

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

  it('plays nothing while motion is turned down', () => {
    enabled.set(false);

    motions.play('coin', 'coin-flip', { backUp: true });

    expect(motions.isPlaying('coin')).toBe(false);
    expect(frames).toEqual([]);
  });
});
