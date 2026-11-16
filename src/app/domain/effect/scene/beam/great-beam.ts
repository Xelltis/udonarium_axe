import {
  type BeamPose,
  beamSwellAt,
  greatBeamSheets,
  layBeamBody,
  layBeamLicks,
  layBeamStreaks,
  onLine,
} from '@axe/domain/effect/scene/beam/beam-body';
import { type ColossalLook } from '@axe/domain/effect/scene/beam/colossal';
import { type Staged } from '@axe/domain/effect/scene/choreography';
import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import { seededRun } from '@axe/domain/effect/scene/effect-sim';
import { glow, hueOf } from '@axe/domain/effect/scene/parts';

/*
 * The great beam: one colossal body of its colour, white at its heart in a dark rim, with streaks of
 * white racing down it and shreds of light torn off its edges and carried along beside it.
 */

/** How many streaks race down its heart, and how many shreds of light fly beside it. */
const STREAKS = 18;
const SHREDS = 22;
/** How many licks stream off its edges. */
const LICKS = 22;

/**
 * Shreds of light torn off the edges of a beam and carried along beside it: each rides out from the
 * edge as it goes, over and over, in the colours given.
 */
export function layBeamShreds(
  drawn: Staged,
  pose: BeamPose,
  cell: number,
  colors: readonly string[],
  count: number
): void {
  if (pose.power <= 0) return;
  const next = seededRun(pose.seed * 89 + 13);
  const long = pose.line.length;
  for (let index = 0; index < count; index++) {
    const turn = next() * Math.PI * 2;
    const pace = 0.9 + next() * 1.1;
    const phase = next();
    const run = (pose.seconds * pace + phase) % 1;
    const along = long * run;
    const out = pose.wide * (0.52 + 0.5 * run) * beamSwellAt(pose, along);
    if (out <= pose.wide * 0.1) continue;
    const at = onLine(pose.line, along, Math.cos(turn) * out, Math.abs(Math.sin(turn)) * out);
    const speed = long * pace;
    drawn.motes.push({
      ...glow(at, cell * 0.1, colors[index % colors.length], Math.min(1, run * 6) * (1 - run) * pose.power, cell * 0.4),
      shape: 'spark',
      velocity: { x: pose.line.way.x * speed, y: pose.line.way.y * speed, z: pose.line.way.z * speed },
      trail: 0.035,
    });
  }
}

/** The great beam as a colossal beam is drawn. */
export const GREAT_BEAM: ColossalLook = {
  wide: 1.25,
  colorsOf: (ramp) => [ramp[5], ramp[4], '#ffffff'],
  layBody: (drawn, pose, ramp, glare) => {
    const dark = mixColor(ramp[0], '#070a22', 0.6);
    layBeamLicks(drawn, pose, { dark, body: [hueOf(ramp), ramp[1], ramp[3]], core: ramp[5] }, LICKS);
    layBeamBody(drawn, pose, greatBeamSheets(ramp, glare));
    layBeamStreaks(drawn, pose, STREAKS, [hueOf(ramp), '#ffffff']);
    layBeamShreds(drawn, pose, pose.wide / 1.25, [ramp[5], ramp[4]], SHREDS);
  },
};
