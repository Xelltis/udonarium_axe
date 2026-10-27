import {
  attackerStep,
  BATTLE_DEFEAT_MAX_MS,
  BATTLE_EFFECT_TAIL_MAX_MS,
  BATTLE_HOLD_MS,
  BATTLE_INTRO_MS,
  BATTLE_OUTRO_MS,
  BATTLE_PLAIN_DEFEAT_MS,
  BATTLE_PLAIN_STRIKE_MS,
  BATTLE_STEP_MS,
  battleTimeline,
  defeatProgress,
  drainProgress,
  fighterEntry,
  gaugeReadingAt,
  hitJolt,
  popState,
  progressBetween,
  stageOpenness,
} from '@axe/domain/battle/battle-timeline';

describe('battleTimeline()', () => {
  it('lands the blow where the effect lands, after the stage opens and the step forward', () => {
    const timeline = battleTimeline({ effectMs: 1000, landingMs: 400, defeat: false, defeatEffectMs: 0 });

    expect(timeline.effectStart).toBe(BATTLE_INTRO_MS + BATTLE_STEP_MS);
    expect(timeline.impact).toBe(timeline.effectStart + 400);
    expect(timeline.defeatStart).toBe(-1);
    expect(timeline.end).toBe(timeline.outroStart + BATTLE_OUTRO_MS);
  });

  it('strikes at once with no effect', () => {
    const timeline = battleTimeline({ effectMs: 0, landingMs: 999, defeat: false, defeatEffectMs: 0 });

    expect(timeline.impact).toBe(timeline.effectStart + BATTLE_PLAIN_STRIKE_MS);
  });

  it('waits no longer than a while past the landing for a long effect to finish', () => {
    const timeline = battleTimeline({ effectMs: 6000, landingMs: 300, defeat: false, defeatEffectMs: 0 });

    expect(timeline.outroStart).toBe(timeline.impact + BATTLE_EFFECT_TAIL_MAX_MS + BATTLE_HOLD_MS);
  });

  it('brings the fallen down once the bars have fallen, waiting for the effect it goes with', () => {
    const quick = battleTimeline({ effectMs: 800, landingMs: 300, defeat: true, defeatEffectMs: 1200 });
    expect(quick.defeatStart).toBeGreaterThan(quick.drainEnd);
    expect(quick.defeatEnd).toBe(quick.defeatStart + 1200);
    expect(quick.outroStart).toBe(quick.defeatEnd + BATTLE_HOLD_MS);

    const long = battleTimeline({ effectMs: 800, landingMs: 300, defeat: true, defeatEffectMs: 4500 });
    expect(long.defeatEnd).toBe(long.defeatStart + BATTLE_DEFEAT_MAX_MS);

    const plain = battleTimeline({ effectMs: 800, landingMs: 300, defeat: true, defeatEffectMs: 0 });
    expect(plain.defeatEnd).toBe(plain.defeatStart + BATTLE_PLAIN_DEFEAT_MS);
  });

  it('keeps a landing past the end of the effect within it', () => {
    const timeline = battleTimeline({ effectMs: 500, landingMs: 900, defeat: false, defeatEffectMs: 0 });

    expect(timeline.impact).toBe(timeline.effectStart + 500);
  });
});

describe('the beats of a playing', () => {
  const timeline = battleTimeline({ effectMs: 1000, landingMs: 400, defeat: true, defeatEffectMs: 1000 });

  it('opens the stage first and closes it last', () => {
    expect(stageOpenness(0, timeline)).toBe(0);
    expect(stageOpenness(timeline.impact, timeline)).toBe(1);
    expect(stageOpenness(timeline.end, timeline)).toBe(0);
  });

  it('steps the sides in during the opening', () => {
    expect(fighterEntry(0)).toBe(0);
    expect(fighterEntry(BATTLE_INTRO_MS)).toBe(1);
  });

  it('steps the one striking forward for the blow and back after it', () => {
    expect(attackerStep(timeline.stepStart, timeline)).toBe(0);
    expect(attackerStep(timeline.effectStart, timeline)).toBe(1);
    expect(attackerStep(timeline.impact + 450, timeline)).toBe(0);
  });

  it('jolts the struck only just after the blow', () => {
    expect(hitJolt(timeline.impact - 1, timeline)).toBe(0);
    expect(Math.abs(hitJolt(timeline.impact + 25, timeline))).toBeGreaterThan(0);
    expect(hitJolt(timeline.impact + 1000, timeline)).toBe(0);
  });

  it('drops the bars from where they stood to where they ended', () => {
    expect(drainProgress(timeline.impact, timeline)).toBe(0);
    expect(drainProgress(timeline.drainEnd, timeline)).toBe(1);
    expect(gaugeReadingAt(12, 4, 0)).toBe(12);
    expect(gaugeReadingAt(12, 4, 0.5)).toBe(8);
    expect(gaugeReadingAt(12, 4, 1)).toBe(4);
  });

  it('shows the numbers only after the blow, large at first', () => {
    expect(popState(timeline.impact - 10, timeline).opacity).toBe(0);
    const burst = popState(timeline.impact, timeline);
    expect(burst.opacity).toBe(1);
    expect(burst.scale).toBeGreaterThan(1);
    expect(popState(timeline.impact + 400, timeline).scale).toBe(1);
  });

  it('brings the fallen down after the bars have fallen', () => {
    expect(defeatProgress(timeline.drainEnd, timeline)).toBe(0);
    expect(defeatProgress(timeline.defeatEnd, timeline)).toBe(1);
  });

  it('brings nobody down where nobody falls', () => {
    const standing = battleTimeline({ effectMs: 1000, landingMs: 400, defeat: false, defeatEffectMs: 0 });
    expect(defeatProgress(standing.end, standing)).toBe(0);
  });
});

describe('progressBetween()', () => {
  it('runs from nothing to all across the stretch', () => {
    expect(progressBetween(5, 10, 20)).toBe(0);
    expect(progressBetween(15, 10, 20)).toBe(0.5);
    expect(progressBetween(25, 10, 20)).toBe(1);
  });

  it('jumps straight across a stretch of no length', () => {
    expect(progressBetween(9, 10, 10)).toBe(0);
    expect(progressBetween(10, 10, 10)).toBe(1);
  });
});
