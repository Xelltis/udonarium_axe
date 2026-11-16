import { outCubic, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { type DarkTones, roundDisc } from '@axe/domain/effect/scene/dark/dark-parts';
import { glow, lightBall, type Point } from '@axe/domain/effect/scene/parts';

/*
 * The black sun of an eclipse, hung over the table and turned to the eye: a pale sun, the black disc
 * that slides across it, the bead of light on its rim as the last of the sun goes, the thin corona
 * that burns round it, streamers standing off it, and the flare it ends in, a ring of light thrown
 * wide and the streamers leaping, before it thins away.
 */

/** Where a black sun hangs, in table pixels, and how far its disc reaches from its middle. */
export interface BlackSun {
  readonly at: Point;
  readonly radius: number;
}

/** When a black sun is covered, when its corona flares and when it is gone, in seconds, and the moment it is drawn at. */
export interface SunClock {
  readonly t: number;
  readonly covered: number;
  readonly flares: number;
  readonly ends: number;
  readonly seed: number;
}

/** How many streamers stand off the corona. */
const STREAMERS = 18;
/** How long the bead of light on the rim lasts, and how long the flare, in seconds. */
const BEAD_S = 0.32;
const FLARE_S = 0.4;

/** A black sun at a moment: see the header. */
export function drawBlackSun(drawn: Staged, sun: BlackSun, tones: DarkTones, clock: SunClock): void {
  const { t, covered, flares } = clock;
  const wide = sun.radius * 2;
  const since = t - flares;
  const left = 1 - outCubic(within(t, flares + 0.5, Math.min(clock.ends, flares + 1)));
  if (left <= 0.01) return;
  const kindled = outCubic(within(t, 0, covered * 0.3));
  const slid = within(t, covered * 0.12, covered);
  const total = t >= covered ? 1 : 0;
  const flaring = since >= 0 && since < FLARE_S ? 1 - since / FLARE_S : 0;
  const near = wide * 0.6;

  drawn.motes.push(
    glow(sun.at, wide * (2.3 + 1.6 * flaring), tones.glow, (0.45 * kindled + 0.4 * total + 0.5 * flaring) * left, near)
  );
  if (total > 0) {
    drawn.motes.push(
      lightBall(sun.at, wide * left * (1.1 + 0.05 * flaring), flaring > 0.3 ? '#ffffff' : tones.pale, left, near + 1)
    );
    for (let streamer = 0; streamer < STREAMERS; streamer++) {
      const turn = (streamer / STREAMERS) * Math.PI * 2 + (clock.seed % 7) * 0.3;
      const flicker = 0.6 + 0.4 * Math.sin(t * (6 + (streamer % 5)) + streamer * 2.4);
      const long = (streamer % 3 === 0 ? 3.4 : 2) * flicker * (1 + 3.2 * flaring);
      drawn.motes.push({
        ...glow(sun.at, sun.radius * 0.34, streamer % 2 === 0 ? tones.pale : tones.glow, 0.9 * left, near),
        shape: 'flare',
        trail: long,
        spin: turn,
        aside: { right: Math.cos(turn) * sun.radius * 0.92 * left, up: Math.sin(turn) * sun.radius * 0.92 * left },
      });
    }
  }
  if (flaring > 0) {
    drawn.motes.push(glow(sun.at, wide * 3.2, tones.pale, 0.6 * flaring * flaring, near));
    drawn.motes.push({
      ...glow(sun.at, wide * (1.1 + 2.2 * outCubic(1 - flaring)), tones.edge, 0.6 * flaring, near),
      blend: 'color',
      shape: 'hoop',
    });
  }
  const beaded = t - covered;
  if (beaded >= 0 && beaded < BEAD_S) {
    const bead = 1 - beaded / BEAD_S;
    const aside = { right: -sun.radius * 0.86, up: sun.radius * 0.28 };
    drawn.motes.push({
      ...glow(sun.at, wide * 1.5 * bead, '#ffffff', bead, near + 2),
      shape: 'star',
      spin: 0.3,
      aside,
    });
    drawn.motes.push({
      ...glow(sun.at, sun.radius * 0.5, '#ffffff', bead, near + 2),
      shape: 'flare',
      trail: 9 * bead,
      spin: 0,
      aside,
    });
    drawn.motes.push({ ...glow(sun.at, sun.radius * 0.9, tones.pale, bead, near + 2), aside });
  }

  if (total < 1) drawn.motes.push(...roundDisc(sun.at, wide * 0.97, tones.pale, kindled, near));
  if (total < 1) drawn.motes.push(...roundDisc(sun.at, wide * 0.8, '#ffffff', kindled, near + 1));
  const offset = { right: (1 - slid) * wide * 1.25, up: (1 - slid) * wide * 0.12 };
  const shown = Math.min(1, slid * 8);
  drawn.motes.push(...roundDisc(sun.at, wide * 1.07 * left, tones.edge, shown * total, near + 2, offset));
  drawn.motes.push(...roundDisc(sun.at, wide * left, '#000000', shown, near + 3, offset));
}
