import { hexChannels } from '@axe/core/util/hex-color';
import type { EffectMote, EffectRibbon } from '@axe/domain/effect/scene/effect-scene';
import { ball, glow, type Point } from '@axe/domain/effect/scene/parts';

/*
 * A great sword, built of bands laid along its length, which turn its flat to whoever looks at it:
 * a blade broad at its shoulders and drawn to a point, its bevelled edges pale about a flat of its
 * colour, a dark fuller down the flat; a crossguard, a grip and a pommel. It is colour, not light,
 * so it holds over a bright table; only the glint that runs along it and the flash it forms in are
 * light. A sword of a deep colour is drawn darker still, its flat nearly black within pale edges.
 *
 * A ramp runs from the deepest shadow at 0 to white at 6.
 */

/** How the sword is laid out along its length, from its point at 0 to its pommel at 1. */
const SHOULDERS = 0.72;
const GUARD_ENDS = 0.76;
const GRIP_ENDS = 0.95;
/** How wide the blade is at its shoulders, the guard across it, and the grip, as shares of its length. */
const BLADE_WIDE = 0.14;
const GUARD_WIDE = 0.44;
const GRIP_WIDE = 0.042;
/** How wide the blade is along it, from its point to its shoulders, against its width there. */
const BLADE_SHAPE: readonly (readonly [along: number, wide: number])[] = [
  [0, 0],
  [0.03, 0.3],
  [0.08, 0.56],
  [0.16, 0.74],
  [0.3, 0.84],
  [0.5, 0.92],
  [SHOULDERS, 1],
];
/** Below this lightness a colour is deep, and a sword of it is drawn dark. */
const DEEP_BELOW = 0.38;

/** How a great sword is drawn at a moment. */
export interface GreatBladeLook {
  readonly ramp: readonly string[];
  readonly alpha: number;
  /** How far it has formed out of light, from a seam of light at 0 to steel at 1. */
  readonly formed: number;
  /** Where along the blade a glint runs, from its shoulders at 0 to its point at 1; none outside that. */
  readonly glint: number;
  /** How far towards the eye its pommel is drawn, in table pixels. */
  readonly forward: number;
  /** How much broader its blade is than a great sword's, as a cleaver's is; as broad as a great sword's without. */
  readonly broad?: number;
}

/** A point of the sword a share of its length from its point, towards its pommel. */
export function alongBlade(tip: Point, axis: Point, length: number, share: number): Point {
  return {
    x: tip.x + axis.x * length * share,
    y: tip.y + axis.y * length * share,
    z: tip.z + axis.z * length * share,
  };
}

/** Whether a sword of a ramp is drawn dark: one whose own colour is deep. */
function isDeep(ramp: readonly string[]): boolean {
  const [r, g, b] = hexChannels(ramp[1]) ?? [128, 128, 128];
  return (r + g + b) / 765 < DEEP_BELOW * 0.82;
}

/**
 * A great sword with its point at `tip`, lying along `axis` from its point towards its pommel, of
 * length one, as long as `length`, in table pixels.
 */
export function greatBlade(
  tip: Point,
  axis: Point,
  length: number,
  look: GreatBladeLook
): { readonly ribbons: EffectRibbon[]; readonly motes: EffectMote[] } {
  const { ramp, alpha } = look;
  if (alpha <= 0.01) return { ribbons: [], motes: [] };
  const formed = Math.min(1, Math.max(0, look.formed));
  const at = (share: number) => alongBlade(tip, axis, length, share);
  const deep = isDeep(ramp);
  const flat = deep ? ramp[0] : ramp[2];
  const sheen = deep ? ramp[1] : ramp[3];
  const fuller = deep ? '#05030a' : ramp[1];
  const edge = deep ? ramp[3] : ramp[5];
  const wide = length * BLADE_WIDE * (look.broad ?? 1) * (0.08 + 0.92 * formed);
  const blade = BLADE_SHAPE.map(([share]) => at(share));
  const shape = BLADE_SHAPE.map(([, share]) => share);
  const band = (scale: number, color: string, core?: string): EffectRibbon => ({
    points: blade,
    widths: shape.map((share) => wide * share * scale),
    color,
    core,
    alpha,
    blend: 'color',
  });
  const ribbons: EffectRibbon[] = [
    {
      points: blade,
      widths: shape.map((share) => wide * share * 2.6),
      color: ramp[2],
      alpha: 0.22 * alpha,
      blend: 'light',
      soft: 1,
    },
    { ...band(1, ramp[0]), widths: shape.map((share) => wide * share + length * 0.014) },
    band(1, edge),
    band(0.7, flat, sheen),
    {
      points: [at(0.2), at(0.45), at(SHOULDERS - 0.01)],
      widths: [0, wide * 0.2, wide * 0.24],
      color: fuller,
      alpha: alpha * formed,
      blend: 'color',
    },
  ];
  const hilt = alpha * formed;
  if (hilt > 0.01) {
    const guard = [at(SHOULDERS - 0.004), at((SHOULDERS + GUARD_ENDS) / 2), at(GUARD_ENDS)];
    const across = length * GUARD_WIDE;
    ribbons.push(
      {
        points: guard,
        widths: [across * 0.92, across + length * 0.02, across * 0.92],
        color: ramp[0],
        alpha: hilt,
        blend: 'color',
      },
      {
        points: guard,
        widths: [across * 0.86, across * 0.96, across * 0.86],
        color: deep ? ramp[1] : ramp[2],
        core: edge,
        alpha: hilt,
        blend: 'color',
      },
      {
        points: [at(GUARD_ENDS), at(GRIP_ENDS)],
        widths: length * GRIP_WIDE * 1.5,
        color: ramp[0],
        alpha: hilt,
        blend: 'color',
      },
      {
        points: [at(GUARD_ENDS), at(GRIP_ENDS)],
        widths: length * GRIP_WIDE,
        color: deep ? '#1a1024' : ramp[1],
        core: deep ? ramp[1] : ramp[2],
        alpha: hilt,
        blend: 'color',
      }
    );
  }
  const motes: EffectMote[] = [];
  if (hilt > 0.01) {
    motes.push(ball(at(0.975), length * 0.075, ramp[0], hilt, look.forward, 0));
    motes.push(ball(at(0.975), length * 0.055, edge, hilt, look.forward + 1, 0));
    motes.push(ball(at((SHOULDERS + GUARD_ENDS) / 2), length * 0.045, edge, hilt, look.forward + 1, 0));
  }
  if (formed < 1) {
    ribbons.push({
      points: blade,
      widths: shape.map((share) => wide * share * 1.2 + length * 0.012),
      color: '#ffffff',
      alpha: alpha * (1 - formed),
      blend: 'color',
    });
    motes.push(glow(at(0.4), length * 0.5, ramp[3], 0.5 * (1 - formed) * alpha, look.forward));
  }
  if (look.glint > 0 && look.glint < 1) {
    const where = SHOULDERS * (1 - look.glint);
    const lit = Math.sin(Math.PI * look.glint);
    ribbons.push({
      points: [at(where + 0.07), at(where), at(Math.max(0, where - 0.07))],
      widths: [0, wide * 0.9, 0],
      color: '#ffffff',
      alpha: 0.85 * lit * alpha,
      blend: 'light',
      soft: 0.8,
    });
    motes.push({
      ...glow(at(where), length * 0.16 * lit, '#ffffff', alpha * lit, look.forward + 2),
      shape: 'star',
      spin: look.glint * 3,
    });
  }
  return { ribbons, motes };
}
