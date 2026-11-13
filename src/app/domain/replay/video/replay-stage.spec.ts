import { REPLAY_STAGE_FADE_MS, stageFigureRect, stageFiguresAt } from '@axe/domain/replay/video/replay-stage';
import type { ReplayStageFigure } from '@axe/domain/replay/video/replay-video-timeline';

function figure(id: string, left: number, partial: Partial<ReplayStageFigure> = {}): ReplayStageFigure {
  return { id, imageIdentifier: `face-${id}`, left, isActive: false, isFlipped: false, isLeaving: false, ...partial };
}

const frame = { width: 1920, height: 1080, portraitHeight: 900 };

describe('stageFiguresAt()', () => {
  it('draws the one speaking last, in front of the others', () => {
    const now = [figure('a', 30, { isActive: true }), figure('b', 70)];

    const ids = stageFiguresAt(now, now, REPLAY_STAGE_FADE_MS, 3000).map((one) => one.figure.id);

    expect(ids).toEqual(['b', 'a']);
  });

  it('glides a figure that stays from where it stood to where it stands now', () => {
    const before = [figure('a', 20)];
    const now = [figure('a', 60)];

    const [atStart] = stageFiguresAt(now, before, 0, 3000);
    const [halfway] = stageFiguresAt(now, before, REPLAY_STAGE_FADE_MS / 2, 3000);
    const [settled] = stageFiguresAt(now, before, REPLAY_STAGE_FADE_MS, 3000);

    expect(atStart.left).toBe(20);
    expect(halfway.left).toBeGreaterThan(20);
    expect(halfway.left).toBeLessThan(60);
    expect(settled).toEqual({ figure: now[0], left: 60, alpha: 1, active: 0, rise: 0 });
  });

  it('moves the prominence over to the one who starts speaking', () => {
    const before = [figure('a', 50)];
    const now = [figure('a', 50, { isActive: true })];

    expect(stageFiguresAt(now, before, 0, 3000)[0].active).toBe(0);
    expect(stageFiguresAt(now, before, REPLAY_STAGE_FADE_MS, 3000)[0].active).toBe(1);
  });

  it('rises a new figure in as it fades on, and stands one already there at once', () => {
    const now = [figure('a', 50)];

    const [coming] = stageFiguresAt(now, [], 0, 3000);
    const [standing] = stageFiguresAt(now, [], REPLAY_STAGE_FADE_MS, 3000);
    const [there] = stageFiguresAt(now, now, 0, 3000);

    expect(coming).toMatchObject({ alpha: 0, rise: 1 });
    expect(standing).toMatchObject({ alpha: 1, rise: 0 });
    expect(there).toMatchObject({ alpha: 1, rise: 0 });
  });

  it('fades a figure that has gone out where it stood, before the figures that stay', () => {
    const before = [figure('gone', 80, { isActive: true }), figure('a', 50)];
    const now = [figure('a', 50)];

    const standings = stageFiguresAt(now, before, REPLAY_STAGE_FADE_MS / 2, 3000);

    expect(standings.map((one) => one.figure.id)).toEqual(['gone', 'a']);
    expect(standings[0]).toMatchObject({ left: 80, active: 1, rise: 0 });
    expect(standings[0].alpha).toBeGreaterThan(0);
    expect(standings[0].alpha).toBeLessThan(1);
    expect(stageFiguresAt(now, before, REPLAY_STAGE_FADE_MS, 3000)[0].alpha).toBe(0);
  });

  it('fades a leaving figure through the end of the segment, and draws it no more once it has left', () => {
    const leaving = figure('a', 50, { isLeaving: true });

    expect(stageFiguresAt([leaving], [leaving], 1000, 3000)[0].alpha).toBe(1);
    expect(stageFiguresAt([leaving], [leaving], 2000, 3000)[0].alpha).toBeLessThan(1);
    expect(stageFiguresAt([leaving], [leaving], 3000, 3000)[0].alpha).toBe(0);
    expect(stageFiguresAt([], [leaving], 0, 3000)).toEqual([]);
  });
});

describe('stageFigureRect()', () => {
  it('stands a portrait as tall as the stage allows, feet just under the bottom edge', () => {
    const rect = stageFigureRect({ width: 300, height: 600 }, frame, 25, 0, 0);

    expect(rect.height).toBeCloseTo(900 * 0.95);
    expect(rect.width).toBeCloseTo(450 * 0.95);
    expect(rect.centreX).toBe(480);
    expect(rect.top + rect.height).toBeCloseTo(1080 + rect.height * 0.02);
  });

  it('stands the one speaking a little larger', () => {
    const quiet = stageFigureRect({ width: 300, height: 600 }, frame, 25, 0, 0);
    const speaking = stageFigureRect({ width: 300, height: 600 }, frame, 25, 1, 0);

    expect(speaking.height).toBeCloseTo(900);
    expect(speaking.height).toBeGreaterThan(quiet.height);
  });

  it('never blows a small picture up far past its own size', () => {
    const rect = stageFigureRect({ width: 50, height: 100 }, frame, 50, 1, 0);

    expect(rect.height).toBeCloseTo(240);
  });

  it('starts a rising figure lower down', () => {
    const standing = stageFigureRect({ width: 300, height: 600 }, frame, 50, 0, 0);
    const rising = stageFigureRect({ width: 300, height: 600 }, frame, 50, 0, 1);

    expect(rising.top - standing.top).toBeCloseTo(1080 * 0.04);
  });
});
