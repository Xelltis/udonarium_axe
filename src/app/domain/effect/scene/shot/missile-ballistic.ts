import type { Stage, Staged } from '@axe/domain/effect/scene/choreography';
import { floorMark, glow, lerpPoint, type Point, smokePuff, wayBetween } from '@axe/domain/effect/scene/parts';
import { missileBody } from '@axe/domain/effect/scene/shot/bodies';
import { layMotorFlame, laySmokeTrail } from '@axe/domain/effect/scene/shot/missile-shot';
import { offsetBy } from '@axe/domain/effect/scene/shot/shot-flight';
import { layDustKick, layHitFlash, layVapourRing } from '@axe/domain/effect/scene/shot/shot-parts';

/*
 * The flight of a ballistic missile. It lights on its pad in a flash, smoke rolling out over the
 * ground round it and lying there, and climbs straight up out of sight on a thick column of smoke
 * that hangs behind it; a red ring closes on the ground where it will come down; high over the
 * target a point of light glints, and it falls nose first out of the sky, its flame drawn out long,
 * rings of vapour torn open along its way and its trail left standing down the whole of the dive.
 */

/** How high it climbs out of sight before it turns over and dives, in cells. */
const CLIMB_CELLS = 7;
/** How long it is drawn, against the cell. */
const BODY = 1.6;
/** The red of the ring that marks where it will come down. */
const TARGETED = '#ff4a3a';
/** How long the smoke of its climb hangs, and that of its dive, in seconds. */
const COLUMN_S = 3;
const DIVE_TRAIL_S = 1.3;
/** How long before it dives the point of light glints over the target, in seconds. */
const GLINTS_S = 0.35;

/**
 * Lays the flight of a ballistic missile at a moment, from its pad at `from` to the instant it comes
 * down at `lands` seconds on the target of the stage: see the header.
 */
export function layBallisticFlight(
  drawn: Staged,
  stage: Stage,
  from: Point,
  lands: number,
  ramp: readonly string[]
): void {
  const { cell } = stage;
  const t = stage.seconds;
  const pad = { x: from.x, y: from.y, z: stage.groundZ };
  const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
  const climbs = lands * 0.4;
  const dives = lands * 0.64;
  const sky = cell * CLIMB_CELLS;
  const body = cell * BODY;
  const forward = cell * 0.4;
  const ends = stage.duration + 1.8;
  const left = Math.max(0, Math.min(1, (ends - t) / 0.5));

  layHitFlash(drawn, { ...pad, z: pad.z + cell * 0.4 }, pad.z, cell, t, 0.2, 3.2, ramp, stage.seed, forward, 8);
  layDustKick(drawn, pad, cell, t, stage.seed, 3.6, forward, { color: '#d6d0c8', count: 9, lastsS: 1.8 });
  if (t >= 0 && t < 0.5) {
    const lit = t / 0.5;
    for (let puff = 0; puff < 8; puff++) {
      const turn = (puff / 8) * Math.PI * 2 + stage.seed;
      const out = cell * (0.3 + lit * 1.9);
      drawn.motes.push(
        smokePuff(
          { x: pad.x + Math.cos(turn) * out, y: pad.y + Math.sin(turn) * out, z: pad.z + cell * 0.25 },
          cell * (0.6 + lit * 0.8),
          '#cfc8bf',
          0.8 * (1 - lit * 0.7),
          forward
        )
      );
    }
  }
  const climbAt = (share: number): Point => ({ x: pad.x, y: pad.y, z: pad.z + body * 0.4 + share * share * sky });
  laySmokeTrail(
    drawn,
    {
      at: climbAt,
      since: t,
      flies: climbs,
      hangs: COLUMN_S,
      cell,
      floorZ: pad.z,
      puffs: 26,
      wide: 1.05,
      seed: stage.seed,
      left,
      lit: ramp[4],
      full: true,
    },
    forward
  );
  if (t >= 0 && t < climbs) {
    const up = t / climbs;
    const tip = { x: pad.x, y: pad.y, z: pad.z + body * 1.4 + up * up * sky };
    const speed = Math.max(cell, (2 * up * sky) / climbs);
    const missile = missileBody(
      tip,
      { x: 0, y: 0, z: 1 },
      body,
      ramp,
      { x: 0, y: 0, z: speed },
      speed,
      forward,
      t * 60
    );
    layMotorFlame(
      drawn,
      { ...tip, z: tip.z - body * 0.95 },
      { x: 0, y: 0, z: -1 },
      body,
      1.3 + up,
      t,
      1,
      ramp,
      forward,
      pad.z
    );
    drawn.ribbons.push(...missile.ribbons);
    drawn.motes.push(...missile.motes);
    drawn.lights.push({ ...tip, color: ramp[4], strength: 1.6 * (1 - up * 0.6), reachPx: cell * 4 });
  }
  if (t >= climbs * 0.7 && t < lands) {
    const closing = (t - climbs * 0.7) / (lands - climbs * 0.7);
    const pulse = 0.6 + 0.4 * Math.sin(t * 22);
    const reach = cell * (1.5 - closing * 0.7);
    drawn.floor.push(
      floorMark('ring', floor, reach, 0.12, '#3a0a06', 0.55, 'color', 0),
      floorMark('sigil', floor, reach, 0.12, TARGETED, 0.8 * pulse, 'light', t * 0.8),
      floorMark('ring', floor, cell * 0.3, 0.35, TARGETED, 0.9 * pulse, 'light', 0),
      floorMark('disc', floor, cell * 0.9, 1, TARGETED, 0.25 * closing, 'light', 0)
    );
  }
  const high = { x: floor.x - cell * 2.2, y: floor.y - cell * 1.2, z: floor.z + sky };
  const glints = (t - (dives - GLINTS_S)) / GLINTS_S;
  if (glints >= 0 && glints < 1.3) {
    const shown = glints < 1 ? glints : 1 - (glints - 1) / 0.3;
    const seen = lerpPoint(high, floor, 0.12);
    for (const [spin, trail] of [
      [0, 8],
      [Math.PI / 2, 5],
    ] as const) {
      drawn.motes.push({
        ...glow(seen, cell * 0.4 * shown, '#ffffff', shown, forward + 2),
        shape: 'flare',
        trail,
        spin,
      });
    }
    drawn.motes.push(glow(seen, cell * 1.8 * shown, ramp[4], 0.7 * shown, forward));
  }
  const diveAt = (share: number): Point => lerpPoint(high, floor, share ** 1.6);
  if (t >= dives) {
    laySmokeTrail(
      drawn,
      {
        at: diveAt,
        since: t - dives,
        flies: lands - dives,
        hangs: DIVE_TRAIL_S,
        cell,
        floorZ: pad.z,
        puffs: 22,
        wide: 0.75,
        seed: stage.seed + 7,
        left,
        lit: ramp[4],
        full: true,
      },
      forward
    );
    const { way } = wayBetween(high, floor);
    for (const along of [0.45, 0.7, 0.88]) {
      const passed = dives + (lands - dives) * along ** (1 / 1.6);
      const open = (t - passed) / 0.4;
      if (open < 0 || open >= 1) continue;
      layVapourRing(
        drawn,
        lerpPoint(high, floor, along),
        way,
        cell * (0.4 + 1.6 * (1 - (1 - open) ** 2)),
        cell * 0.14 * (1 - open * 0.6),
        '#f2f4f7',
        0.85 * (1 - open),
        stage.groundZ
      );
    }
  }
  if (t >= dives && t < lands) {
    const share = (t - dives) / (lands - dives);
    const { way, length } = wayBetween(high, floor);
    const tip = diveAt(share);
    const speed = (1.6 * share ** 0.6 * length) / (lands - dives);
    const missile = missileBody(
      tip,
      way,
      body,
      ramp,
      { x: way.x * speed, y: way.y * speed, z: way.z * speed },
      speed,
      forward,
      t * 60
    );
    const back = { x: -way.x, y: -way.y, z: -way.z };
    layMotorFlame(drawn, offsetBy(tip, way, -body * 0.95), back, body, 1.6 + 1.6 * share, t, 1, ramp, forward, pad.z);
    drawn.ribbons.push(...missile.ribbons);
    drawn.motes.push(...missile.motes);
    drawn.lights.push({ ...tip, color: ramp[4], strength: 1.4, reachPx: cell * 4 });
  }
  layHitFlash(
    drawn,
    { ...floor, z: floor.z + cell * 0.6 },
    floor.z,
    cell,
    t - lands,
    0.2,
    4.5,
    ramp,
    stage.seed + 3,
    forward,
    8
  );
}
