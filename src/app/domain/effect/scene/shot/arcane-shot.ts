import { flowingMote } from '@axe/domain/effect/scene/breath/breath-draw';
import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import { acrossOf, floorMark, glow, hueOf, wayBetween } from '@axe/domain/effect/scene/parts';
import { detailOf, offsetBy, powerOf, type ShotLook } from '@axe/domain/effect/scene/shot/shot-flight';
import { floorUnder, layHitFlash, laySpray } from '@axe/domain/effect/scene/shot/shot-parts';

/*
 * A bolt of magic of no element. Its heart is a hard white diamond in its colour and a dark rim; a
 * flame of its colour streams back off it, two threads of light are drawn out behind it along the way
 * it has come, and glints are shed to either side. Where it strikes it flashes and throws sparks of
 * its colour; what it lands in is drawn by the look it lands with.
 */

/** How long the diamond is, and how wide, in cells. */
const LONG = 1.5;
const WIDE = 0.6;
const SHADOW = '#0a0a1c';

/** Draws a bolt of magic at a moment: see the header. */
export const drawArcaneShot: ShotLook = (drawn, shot, ramp) => {
  const { cell, seconds: t } = shot;
  const since = t - shot.launch;
  if (since < 0) return;
  const power = powerOf(shot.grade);
  const detail = detailOf(shot.shots);
  const forward = cell * 0.4;
  const hue = hueOf(ramp);
  const dark = mixColor(ramp[0], SHADOW, 0.6);
  const flies = Math.max(shot.lands - shot.launch, 0.02);
  const share = since / flies;

  if (share < 1) {
    const at = shot.pathAt(share);
    const { way } = wayBetween(shot.pathAt(Math.max(0, share - 0.03)), shot.pathAt(Math.min(1, share + 0.03)));
    const { side, lift } = acrossOf(way);
    const long = cell * LONG * power;
    const wide = cell * WIDE * power;
    const back = { x: -way.x, y: -way.y, z: -way.z };
    const root = offsetBy(at, way, -long * 0.2);
    drawn.motes.push(
      flowingMote('lick', root, back, wide * 1.25, long * 2.2, t * 12, {
        color: dark,
        alpha: 0.8,
        forward: forward - 1,
        variant: shot.seed % 6,
      }),
      flowingMote('lick', root, back, wide, long * 1.9, t * 15 + 2, {
        color: hue,
        core: ramp[5],
        alpha: 1,
        forward,
        variant: (shot.seed + 3) % 6,
      }),
      glow(at, wide * 3.2, ramp[4], 0.6, forward)
    );
    for (const aside of [-1, 1]) {
      const points = [0.34, 0.2, 0.08, 0].map((behind) => {
        const was = shot.pathAt(Math.max(0, share - behind));
        return offsetBy(was, side, aside * wide * (0.3 + behind * 2));
      });
      drawn.ribbons.push({
        points,
        widths: [0, wide * 0.1, wide * 0.16, wide * 0.1],
        color: ramp[5],
        alpha: 0.9,
        alphas: [0, 0.5, 1, 1],
        blend: 'light',
      });
    }
    const points = [0.75, 0.18, -0.28].map((behind) => offsetBy(at, way, -long * behind));
    drawn.ribbons.push(
      { points, widths: [0, wide * 1.3, 0], color: dark, alpha: 0.85, blend: 'color', soft: 0.3 },
      { points, widths: [0, wide, 0], color: hue, core: ramp[5], alpha: 1, blend: 'color' },
      { points, widths: [0, wide * 0.5, 0], color: '#ffffff', alpha: 1, blend: 'color' }
    );
    const glints = Math.max(2, Math.round(5 * detail));
    for (let glint = 1; glint <= glints; glint++) {
      const was = share - glint * 0.07;
      if (was < 0) break;
      const where = shot.pathAt(was);
      const off = Math.sin(shot.seed * 3 + glint * 2.1) * wide * 0.7;
      const up = Math.cos(glint * 1.7 + shot.seed) * wide * 0.5;
      drawn.motes.push({
        ...glow(
          offsetBy(offsetBy(where, side, off), lift, up),
          wide * 0.55,
          glint % 2 ? '#ffffff' : ramp[5],
          1 - glint / (glints + 1),
          forward
        ),
        shape: 'star',
        spin: glint + share * 6,
      });
    }
    drawn.floor.push(floorMark('disc', floorUnder(at, shot.floorZ), cell * 1.1, 1, hue, 0.28, 'light', 0));
    drawn.lights.push({ ...at, color: ramp[4], strength: 1, reachPx: cell * 2.6 });
  }

  const struck = t - shot.lands;
  if (struck < 0) return;
  const { way } = wayBetween(shot.pathAt(0.94), shot.pathAt(1));
  layHitFlash(drawn, shot.to, shot.floorZ, cell, struck, 0.14, 2.4 * power, ramp, shot.seed + shot.index, forward, 6);
  laySpray(
    drawn,
    {
      at: shot.to,
      way: { x: -way.x, y: -way.y, z: -way.z },
      spread: 1,
      cell,
      floorZ: shot.floorZ,
      since: struck,
      lastsS: 0.3,
      seed: shot.seed + shot.index * 3,
      count: Math.max(5, Math.round(12 * detail)),
      fast: [4, 11],
      size: 0.09,
    },
    ramp[4],
    forward + 1
  );
};
