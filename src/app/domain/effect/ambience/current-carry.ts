import type { SkyCurrent } from '@axe/domain/effect/ambience/ambience-sky';

/** The longest step one pass counts, in milliseconds, so a screen coming back from a pause does not jump. */
const LONGEST_STEP_MS = 100;

/**
 * How far flowing water has carried what drifts in it, kept from pass to pass.
 *
 * Worked out from the elapsed time alone, everything drifting would leap the moment the eye
 * turned and the current came at it from another side; adding up each pass's step instead lets
 * it turn with the eye and carry on from where it was.
 */
export class CurrentCarry {
  private at: number | null = null;
  private across = 0;
  private toward = 0;

  /**
   * How far the water has carried what drifts in it by `now`, flowing as given since the pass
   * before, in cells; or null for still water, which forgets how far it had carried.
   */
  advance(now: number, flow: { readonly across: number; readonly toward: number } | null): SkyCurrent | null {
    if (!flow || !Number.isFinite(now)) {
      this.at = null;
      this.across = 0;
      this.toward = 0;
      return null;
    }
    const step = this.at === null ? 0 : Math.min(Math.max(now - this.at, 0), LONGEST_STEP_MS) / 1000;
    this.at = now;
    this.across += flow.across * step;
    this.toward += flow.toward * step;
    return { carriedAcross: this.across, carriedToward: this.toward, across: flow.across, toward: flow.toward };
  }
}
