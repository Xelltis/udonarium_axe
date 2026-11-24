import { battleTimeline } from '@axe/domain/battle/battle-timeline';
import { type ActingFighter, figureActing, figureTurnDeg } from '@axe/features/battle-cut-in/battle-figure-acting';

const timeline = battleTimeline({ effectMs: 900, landingMs: 400, defeat: true, defeatEffectMs: 0 });

function fighter(fields: Partial<ActingFighter> = {}): ActingFighter {
  return { striking: false, side: 'right', defeated: false, hurt: true, ...fields };
}

/** What a fighter does at a moment of the stage, the frame clock standing at 10 seconds then. */
const acting = (of: ActingFighter, elapsed: number) => figureActing(of, timeline, elapsed, 10_000, 3, 'attack');

describe('what a fighter’s model does on the battle stage', () => {
  it('turns each side towards the one across, yet towards the screen', () => {
    expect(figureTurnDeg('left')).toBeLessThan(0);
    expect(figureTurnDeg('right')).toBe(-figureTurnDeg('left'));
    expect(Math.abs(figureTurnDeg('left'))).toBeLessThan(90);
  });

  it('walks while the sides step in, and stands once they are in place', () => {
    expect(acting(fighter(), 100).walking).toBe(true);
    expect(acting(fighter(), timeline.stepStart + 1).walking).toBe(false);
  });

  it('has the one striking walk as it steps forward, and strike as the effect of the blow begins, towards the one across', () => {
    const striking = fighter({ striking: true, side: 'left' });

    expect(acting(striking, timeline.stepStart + 50).walking).toBe(true);
    expect(acting(striking, timeline.effectStart + 1).walking).toBe(false);
    expect(acting(striking, timeline.effectStart).act).toEqual({
      key: 'battle:3:attack',
      role: 'attack',
      atMs: 10_000,
      toward: { x: 1, y: 0 },
    });
    expect(figureActing(striking, timeline, timeline.effectStart, 0, 3, 'cast').act?.role).toBe('cast');
  });

  it('has one the exchange hurts take the blow as it lands, from the one across, and one it does not hurt take none', () => {
    expect(acting(fighter(), timeline.impact + 40).act).toEqual({
      key: 'battle:3:hit',
      role: 'hit',
      atMs: 10_000 - 40,
      toward: { x: -1, y: 0 },
    });
    expect(acting(fighter({ hurt: false }), timeline.impact + 10).act).toBeUndefined();
  });

  it('has one brought down go down once the bars have fallen, and not before', () => {
    const felled = fighter({ defeated: true });

    expect(acting(felled, timeline.defeatStart - 1).act?.role).toBe('hit');
    expect(acting(felled, timeline.defeatStart).act).toMatchObject({
      key: 'battle:3:defeat',
      role: 'defeat',
      atMs: 10_000,
    });
    expect(acting(fighter(), timeline.defeatStart + 100).act?.role).toBe('hit');
  });

  it('tells an act only once the stage’s own clock has come to it, from where it began, however late on the wall’s clock', () => {
    const striking = fighter({ striking: true });

    expect(acting(striking, timeline.effectStart - 1).act).toBeUndefined();
    expect(acting(fighter(), timeline.impact - 1).act).toBeUndefined();
    expect(figureActing(striking, timeline, timeline.effectStart + 16, 25_000, 3, 'attack').act?.atMs).toBe(
      25_000 - 16
    );
  });

  it('keeps one act under one key through the playing, and tells one playing from another', () => {
    const striking = fighter({ striking: true });
    const at = timeline.effectStart;

    expect(acting(striking, at).act?.key).toBe(acting(striking, timeline.end).act?.key);
    expect(figureActing(striking, timeline, at, 0, 4, 'attack').act?.key).not.toBe(acting(striking, at).act?.key);
  });
});
