import { hexChannels } from '@axe/core/util/hex-color';
import type { Staged } from '@axe/domain/effect/scene/choreography';
import type { EffectBlend, EffectRibbon } from '@axe/domain/effect/scene/effect-scene';
import { floorMark, type Point } from '@axe/domain/effect/scene/parts';
import type { Aside } from '@axe/domain/effect/scene/space/space-parts';

/*
 * The heavy bodies the looks of space and time are drawn in, so that they hold on a bright table from
 * far off: every body is laid in colour, of one hue taken to full colour, over a rim of its own darkest
 * shade a little wider than it, and its heart is taken towards a pale core; light is laid under it only
 * where it burns. The hue is the effect's own, so an effect given other colours keeps its own.
 */

/** The colours of a heavy body: the near black it is rimmed in, the full colour of its body, a hotter colour beside it, its pale core, and the black at its depths. */
export interface BoldTones {
  readonly rim: string;
  readonly body: string;
  readonly hot: string;
  readonly core: string;
  readonly ink: string;
}

function channelsOf(color: string): [number, number, number] {
  const channels = hexChannels(color) ?? [128, 128, 128];
  return [channels[0] / 255, channels[1] / 255, channels[2] / 255];
}

function hexOf(channels: readonly number[]): string {
  return `#${channels
    .map((channel) =>
      Math.round(Math.min(1, Math.max(0, channel)) * 255)
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`;
}

/** The hue of a colour, as a share of a round from red; nothing for a grey, which has none, or for what is no colour. */
export function hueOfColor(color: string): number | null {
  const [r, g, b] = channelsOf(color);
  const high = Math.max(r, g, b);
  const low = Math.min(r, g, b);
  const spread = high - low;
  if (spread < 1e-3) return null;
  const sixth = high === r ? ((g - b) / spread + 6) % 6 : high === g ? (b - r) / spread + 2 : (r - g) / spread + 4;
  return sixth / 6;
}

/**
 * A colour of the hue of another at a lightness and a share of full colour, from 0 to 1 each, its hue
 * turned round by `turn` of a round; a grey for a colour that has no hue.
 */
export function hueTone(color: string, lightness: number, saturation = 1, turn = 0): string {
  const hue = hueOfColor(color);
  if (hue === null) return hexOf([lightness, lightness, lightness]);
  const h = (((hue + turn) % 1) + 1) % 1;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = chroma * (1 - Math.abs(((h * 6) % 2) - 1));
  const sector = Math.floor(h * 6) % 6;
  const [r, g, b] = [
    [chroma, x, 0],
    [x, chroma, 0],
    [0, chroma, x],
    [0, x, chroma],
    [x, 0, chroma],
    [chroma, 0, x],
  ][sector];
  const m = lightness - chroma / 2;
  return hexOf([r + m, g + m, b + m]);
}

/**
 * The colours of a heavy body of an effect: its body and rim of the hue of its deep colour, its hot
 * colour of that hue turned by `hotTurn`, and its core of the hue of its light colour.
 */
export function boldTonesOf(deep: string, light: string, hotTurn = 0.08): BoldTones {
  return {
    rim: hueTone(deep, 0.13, 0.75),
    body: hueTone(deep, 0.44, 1),
    hot: hueTone(deep, 0.62, 1, hotTurn),
    core: hueTone(light, 0.9, 1),
    ink: hueTone(deep, 0.05, 0.6),
  };
}

/** How a heavy band is painted: its rim, its body, its core and the light under it, how wide and how much of each is seen. */
export interface BoldPaint {
  readonly rim: string;
  readonly body: string;
  readonly core?: string;
  /** The light laid under it where it burns, and how much; none without. */
  readonly glow?: string;
  readonly lit?: number;
  readonly wide: number;
  readonly alpha: number;
  readonly alphas?: readonly number[];
  readonly torn?: number;
  readonly flowed?: number;
}

/** How wide the rim of a heavy band or mark is against its body. */
const RIM_SHARE = 1.4;

/**
 * Lays a heavy band through points: the light under it where it burns, then its rim a little wider
 * than its body, then its body taken to its core in its middle; by halves about `about` when it winds
 * about something, the near half as much as `nearShare` leaves of it and the far half as much as
 * `farShare` does.
 */
export function layBoldBand(
  drawn: Staged,
  points: readonly Point[],
  paint: BoldPaint,
  about?: Point | readonly Point[],
  nearShare = 1,
  farShare = 1
): void {
  if (points.length < 2 || paint.alpha <= 0.01 || paint.wide < 0.3) return;
  const hubs = about === undefined ? undefined : Array.isArray(about) ? [...about] : points.map(() => about as Point);
  const halves = hubs
    ? ([
        ['far', farShare],
        ['near', nearShare],
      ] as const)
    : ([[undefined, 1]] as const);
  for (const [half, share] of halves) {
    if (share <= 0.01) continue;
    const band: Omit<EffectRibbon, 'color' | 'alpha' | 'blend' | 'widths'> = {
      points: [...points],
      alphas: paint.alphas,
      ...(hubs ? { about: hubs, half } : {}),
    };
    if (paint.glow && (paint.lit ?? 0) > 0.01) {
      drawn.ribbons.push({
        ...band,
        widths: paint.wide * 1.9,
        color: paint.glow,
        alpha: Math.min(1, paint.lit ?? 0) * share * 0.6,
        blend: 'light',
        soft: 0.85,
      });
    }
    drawn.ribbons.push({
      ...band,
      widths: paint.wide * RIM_SHARE + 2,
      color: paint.rim,
      alpha: Math.min(1, paint.alpha * share * 1.1),
      blend: 'color',
      torn: paint.torn,
      flowed: paint.flowed,
    });
    drawn.ribbons.push({
      ...band,
      widths: paint.wide,
      color: paint.body,
      core: paint.core ?? paint.body,
      alpha: paint.alpha * share,
      blend: 'color',
      torn: paint.torn,
      flowed: paint.flowed,
    });
  }
}

/**
 * Lays a heavy ring on the floor: light under it where it burns, its rim, its body and a thread of its
 * core. `width` is how wide its body is, as a share of the radius, as a ring takes it.
 */
export function layBoldFloorRing(
  drawn: Staged,
  floor: Point,
  radius: number,
  width: number,
  tones: Pick<BoldTones, 'rim' | 'body' | 'core'>,
  alpha: number,
  lit = 0,
  glow = tones.body
): void {
  if (alpha <= 0.01 || radius < 1) return;
  if (lit > 0.01)
    drawn.floor.push(floorMark('ring', floor, radius, Math.min(1, width * 2.2), glow, 0.5 * lit, 'light', 0));
  drawn.floor.push(floorMark('ring', floor, radius, Math.min(1, width * 1.7), tones.rim, 0.9 * alpha, 'color', 0));
  drawn.floor.push(floorMark('ring', floor, radius, width, tones.body, alpha, 'color', 0));
  drawn.floor.push(floorMark('ring', floor, radius, width * 0.3, tones.core, alpha, 'color', 0));
}

/** How a heavy line laid across the screen is painted: its rim, its body, its core and the light under it. */
export interface BoldLinePaint {
  readonly rim: string;
  readonly body: string;
  readonly core: string;
  readonly glow: string;
  readonly alpha: number;
  readonly lit: number;
  readonly wide: number;
  readonly forward: number;
  /** Whether it thins towards both its ends, as a streak torn away. */
  readonly tapers?: boolean;
}

/** How far apart the beads of a heavy line laid across the screen are, as a share of how wide it is. */
const BEAD_SPACING = 0.32;

/**
 * Lays a heavy line across the screen through points set off from a middle, as `aside` sets them: a
 * flare of light under each step of it, then hard beads of its rim strung close along it, beads of its
 * body narrower over them and a soft streak of its core along its middle, since colour is laid over
 * light; thinning towards its ends where it `tapers`.
 */
export function layBoldScreenLine(drawn: Staged, middle: Point, steps: readonly Aside[], paint: BoldLinePaint): void {
  if (paint.alpha <= 0.01 || paint.wide < 0.3 || steps.length < 2) return;
  const lengths = steps.slice(1).map((to, index) => Math.hypot(to.right - steps[index].right, to.up - steps[index].up));
  const total = lengths.reduce((sum, long) => sum + long, 0);
  if (total < 0.5) return;
  const beads: { readonly aside: Aside; readonly scale: number }[] = [];
  const count = Math.max(2, Math.ceil(total / (paint.wide * BEAD_SPACING)));
  let segment = 0;
  let before = 0;
  for (let bead = 0; bead <= count; bead++) {
    const along = (bead / count) * total;
    while (segment < lengths.length - 1 && before + lengths[segment] < along) before += lengths[segment++];
    const share = lengths[segment] > 0 ? Math.min(1, (along - before) / lengths[segment]) : 0;
    const from = steps[segment];
    const to = steps[segment + 1];
    beads.push({
      aside: { right: from.right + (to.right - from.right) * share, up: from.up + (to.up - from.up) * share },
      scale: paint.tapers ? 0.3 + 0.7 * Math.sin((Math.PI * bead) / count) : 1,
    });
  }
  const flare = (index: number, size: number, color: string, alpha: number, blend: EffectBlend, nearer: number) => {
    const from = steps[index];
    const to = steps[index + 1];
    const long = lengths[index];
    if (long < 0.5) return;
    drawn.motes.push({
      ...middle,
      size,
      color,
      alpha,
      blend,
      shape: 'flare',
      trail: Math.max(1, (long * 1.3) / size),
      spin: Math.atan2(to.up - from.up, to.right - from.right),
      aside: { right: (from.right + to.right) / 2, up: (from.up + to.up) / 2 },
      forward: paint.forward + nearer,
    });
  };
  if (paint.lit > 0.01) {
    lengths.forEach((_long, index) =>
      flare(index, paint.wide * 3, paint.glow, Math.min(1, paint.lit) * 0.6, 'light', 0)
    );
  }
  for (const [share, color, nearer] of [
    [1, paint.rim, 0.5],
    [0.62, paint.body, 1],
  ] as const) {
    for (const bead of beads) {
      drawn.motes.push({
        ...middle,
        size: paint.wide * share * bead.scale,
        color,
        alpha: Math.min(1, paint.alpha * (share === 1 ? 1.1 : 1)),
        blend: 'color',
        shape: 'puff',
        variant: 0,
        aside: bead.aside,
        forward: paint.forward + nearer,
      });
    }
  }
  lengths.forEach((_long, index) => flare(index, paint.wide * 0.8, paint.core, paint.alpha, 'color', 2));
}
