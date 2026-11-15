import { type Choreography, nothingStaged, outCubic, within } from '@axe/domain/effect/scene/choreography';
import { rampOf } from '@axe/domain/effect/scene/effect-ramp';
import { acrossOf, glow, haze, hueOf, lerpPoint, wayBetween } from '@axe/domain/effect/scene/parts';
import { chestOf, originOf } from '@axe/domain/effect/scene/shot/stream-ends';

/**
 * A draining: motes of the target's life drawn out of it and back along curving ways to the caster,
 * a dark glow wrapping the target and the caster glowing as it drinks them in.
 */
export const drain: Choreography = {
  lingerS: 0.5,
  draw: (stage) => {
    const drawn = nothingStaged();
    const { cell, duration } = stage;
    const t = stage.seconds;
    const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
    const caster = originOf(stage);
    const target = chestOf(stage);
    const { way, length } = wayBetween(target, caster);
    const { side, lift } = acrossOf(way);
    const flowing = Math.min(
      within(t, duration * 0.1, duration * 0.25),
      1 - within(t, duration * 0.75, duration * 0.92)
    );
    const forward = cell * 0.4;
    if (flowing <= 0) return drawn;
    drawn.motes.push(haze(target, cell * 1.6, hueOf(ramp), 0.45 * flowing, forward));
    drawn.motes.push(glow(target, cell * 1.3, ramp[1], 0.5 * flowing, forward));
    drawn.motes.push(glow(caster, cell * (0.7 + 0.2 * Math.sin(t * 9)), ramp[4], 0.7 * flowing, forward));
    drawn.lights.push({ ...caster, color: ramp[4], strength: 0.9 * flowing, reachPx: cell * 2 });
    const motes = 22;
    for (let index = 0; index < motes; index++) {
      const along = (t * 0.9 + index / motes) % 1;
      const bow = Math.sin(Math.PI * along) * length * 0.22 * Math.sin(index * 2.7 + 1);
      const rise = Math.sin(Math.PI * along) * length * 0.18 * Math.abs(Math.cos(index * 1.9));
      const at = lerpPoint(target, caster, outCubic(along));
      const point = {
        x: at.x + side.x * bow + lift.x * rise,
        y: at.y + side.y * bow + lift.y * rise,
        z: at.z + side.z * bow + lift.z * rise,
      };
      const fade = Math.min(1, along * 6, (1 - along) * 6) * flowing;
      drawn.motes.push(haze(point, cell * 0.5, hueOf(ramp), 0.55 * fade, forward));
      drawn.motes.push(glow(point, cell * 0.38, ramp[4], fade, forward));
      drawn.motes.push({
        ...glow(point, cell * 0.12, '#ffffff', fade, forward),
        shape: 'spark',
        velocity: { x: way.x * length, y: way.y * length, z: way.z * length },
        trail: 0.06,
      });
    }
    return drawn;
  },
};
