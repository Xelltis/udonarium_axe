import { nothingStaged, type Staged } from '@axe/domain/effect/scene/choreography';
import { rampOf } from '@axe/domain/effect/scene/effect-ramp';
import { lerpPoint } from '@axe/domain/effect/scene/parts';
import { drawArcaneShot } from '@axe/domain/effect/scene/shot/arcane-shot';
import { drawCurseShot } from '@axe/domain/effect/scene/shot/curse-shot';
import { drawHolyShot } from '@axe/domain/effect/scene/shot/holy-shot';
import type { FiredShot, ShotLook } from '@axe/domain/effect/scene/shot/shot-flight';
import { drawSpiritShot } from '@axe/domain/effect/scene/shot/spirit-shot';

const CELL = 50;
const HAND = { x: 100, y: 300, z: 30 };
const BODY = { x: 500, y: 300, z: 27 };
const ENDS = 2.7;
const LANDS = 0.34;

function shotAt(
  look: ShotLook,
  colors: readonly [string, string],
  seconds: number,
  fields: Partial<FiredShot> = {}
): Staged {
  const drawn = nothingStaged();
  look(
    drawn,
    {
      from: HAND,
      to: BODY,
      aim: BODY,
      cell: CELL,
      floorZ: 0,
      seconds,
      launch: 0,
      lands: LANDS,
      ends: ENDS,
      index: 0,
      shots: 1,
      seed: 5,
      grade: 2,
      landsIn: 'burst',
      pathAt: (along) => lerpPoint(HAND, BODY, along),
      ...fields,
    },
    rampOf(colors[0], colors[1], 7)
  );
  return drawn;
}

const SPIRIT = ['#dff6ff', '#39a7ff'] as const;
const DARK = ['#d5aaff', '#5a2b8c'] as const;
const GOLD = ['#fffbe0', '#ffc24a'] as const;
const BLUE = ['#cfe6ff', '#4f8bff'] as const;
const gathered = { launch: 0.2, lands: 0.54 };
const spiritAt = (seconds: number, fields: Partial<FiredShot> = {}) =>
  shotAt(drawSpiritShot, SPIRIT, seconds, { ...gathered, ...fields });
const curseAt = (seconds: number, fields: Partial<FiredShot> = {}) => shotAt(drawCurseShot, DARK, seconds, fields);
const holyAt = (seconds: number, fields: Partial<FiredShot> = {}) => shotAt(drawHolyShot, GOLD, seconds, fields);
const arcaneAt = (seconds: number, fields: Partial<FiredShot> = {}) => shotAt(drawArcaneShot, BLUE, seconds, fields);
const ringsOf = (drawn: Staged) => drawn.ribbons.filter((ribbon) => ribbon.half !== undefined);
const widest = (drawn: Staged): number =>
  Math.max(...drawn.ribbons.filter((ribbon) => ribbon.blend === 'color').flatMap((ribbon) => ribbon.widths));

describe('a shot of spirit', () => {
  it('is gathered at the hands before it is thrown: a ball swelling there, light running in to it', () => {
    const early = spiritAt(0.05);
    const late = spiritAt(0.18);
    const near = (drawn: Staged): boolean =>
      [...drawn.motes, ...drawn.ribbons.flatMap((ribbon) => ribbon.points)].every(
        (part) => Math.hypot(part.x - HAND.x, part.y - HAND.y) < CELL * 2.5
      );

    expect(near(early) && near(late)).toBe(true);
    expect(widest(late)).toBeGreaterThan(widest(early) * 1.5);
    expect(early.motes.filter((mote) => mote.shape === 'spark').length).toBeGreaterThan(4);
  });

  it('flies as a ball in a shell of rings laid either side of it, a wake wound behind it', () => {
    const flying = spiritAt(0.4);
    const wake = flying.ribbons.filter((ribbon) => ribbon.points.length === 11 && ribbon.torn !== undefined);
    const across = wake[0].points.map((point) => point.y - HAND.y);

    expect(ringsOf(flying).filter((ribbon) => ribbon.half === 'far')).toHaveLength(3);
    expect(ringsOf(flying).filter((ribbon) => ribbon.half === 'near')).toHaveLength(3);
    expect(widest(flying)).toBeGreaterThan(CELL * 0.8);
    expect(wake).toHaveLength(2);
    expect(Math.min(...across)).toBeLessThan(0);
    expect(Math.max(...across)).toBeGreaterThan(0);
  });

  it('bursts with a clap: rings thrown open about the way it came and along the floor, and threads of light that rise', () => {
    const clap = spiritAt(0.6);
    const after = spiritAt(1.3);
    const risingAbove = after.motes.filter(
      (mote) => mote.shape === 'spark' && mote.velocity!.z > 0 && mote.z > BODY.z + CELL * 0.5
    );

    expect(ringsOf(clap).length).toBeGreaterThan(1);
    expect(clap.floor.some((mark) => mark.shape === 'ring')).toBe(true);
    expect(risingAbove.length).toBeGreaterThan(3);
    expect(after.floor.some((mark) => mark.shape === 'ring' && mark.blend === 'color')).toBe(true);
    expect(spiritAt(2.1).motes).toHaveLength(0);
  });
});

describe('a shot of a curse', () => {
  it('flies as a black knot with the face of a skull, winding off its course, black flame streaming back off it', () => {
    const flying = curseAt(0.15);
    const skull = flying.motes.find((mote) => mote.shape === 'skull')!;
    const flames = flying.motes.filter((mote) => mote.shape === 'lick');

    expect(skull.size).toBeGreaterThan(CELL * 0.7);
    expect(flames).toHaveLength(3);
    expect(flames.every((flame) => flame.core === '#0b0512')).toBe(true);
    const offCourse = [0.08, 0.15, 0.22].map(
      (seconds) => curseAt(seconds).motes.find((mote) => mote.shape === 'skull')!.y - HAND.y
    );
    expect(Math.max(...offCourse.map(Math.abs))).toBeGreaterThan(CELL * 0.2);
  });

  it('drips darkness along its way, each drop falling to stain the floor for a while', () => {
    const dripping = curseAt(0.3);
    const stains = (drawn: Staged) => drawn.floor.filter((mark) => mark.shape === 'disc' && mark.x < BODY.x - CELL);

    expect(dripping.motes.some((mote) => mote.shape === 'comet' && mote.velocity!.z < 0)).toBe(true);
    expect(stains(curseAt(0.6)).length).toBeGreaterThan(2);
    expect(stains(curseAt(2))).toHaveLength(0);
  });

  it('clings where it strikes: coils wound up about the one struck, laid by halves, drawing tight, under a skull that swells', () => {
    const coilsOf = (seconds: number) =>
      ringsOf(curseAt(seconds)).filter((ribbon) => ribbon.color === '#0b0512' && ribbon.half === 'near');
    const reachOf = (seconds: number): number =>
      Math.max(...coilsOf(seconds)[0].points.map((point) => Math.hypot(point.x - BODY.x, point.y - BODY.y)));
    const skullAt = (seconds: number) => curseAt(seconds).motes.find((mote) => mote.shape === 'skull')!;

    expect(coilsOf(LANDS + 0.2)).toHaveLength(3);
    expect(reachOf(LANDS + 0.6)).toBeLessThan(reachOf(LANDS + 0.1));
    expect(skullAt(LANDS + 0.3).size).toBeGreaterThan(skullAt(LANDS + 0.05).size);
    expect(coilsOf(LANDS + 0.9)).toHaveLength(0);
  });
});

describe('a shot of holy light', () => {
  it('flies as the point of a spear, long and drawn to a tip, a halo riding on it by halves', () => {
    const flying = holyAt(0.2);
    const spear = flying.ribbons.filter((ribbon) => ribbon.points.length === 4 && !ribbon.about);
    const long = spear[1].points[3].x - spear[1].points[0].x;

    expect(spear).toHaveLength(3);
    expect(long).toBeGreaterThan(CELL * 2);
    expect((spear[1].widths as number[])[3]).toBe(0);
    expect(spear[2].color).toBe('#ffffff');
    expect(ringsOf(flying).filter((ribbon) => ribbon.half === 'far')).toHaveLength(2);
    expect(ringsOf(flying).filter((ribbon) => ribbon.half === 'near').length).toBeGreaterThanOrEqual(2);
  });

  it('sheds feathers along its way, which hang and drift down after it has passed', () => {
    const feathersOf = (seconds: number) =>
      holyAt(seconds, { lands: 0.3 }).motes.filter((mote) => mote.shape === 'feather');
    const first = (seconds: number) => feathersOf(seconds)[0];

    expect(feathersOf(0.2).length).toBeGreaterThan(0);
    expect(first(1).z).toBeLessThan(first(0.7).z);
    expect(first(1).alpha).toBeLessThan(first(0.7).alpha);
  });

  it('throws feathers up where it strikes and opens a ring of gold about the way it came', () => {
    const struck = holyAt(LANDS + 0.2);

    expect(struck.motes.filter((mote) => mote.shape === 'feather' && mote.z > BODY.z).length).toBeGreaterThan(3);
    expect(ringsOf(struck).length).toBeGreaterThan(0);
  });
});

describe('a bolt of plain magic', () => {
  it('flies as a hard diamond, white at its heart in its colour and a dark rim, a flame of its colour behind it', () => {
    const flying = arcaneAt(0.2);
    const diamond = flying.ribbons.filter((ribbon) => ribbon.points.length === 3);

    expect(diamond).toHaveLength(3);
    expect((diamond[0].widths as number[])[1]).toBeGreaterThan((diamond[1].widths as number[])[1]);
    expect((diamond[1].widths as number[])[1]).toBeGreaterThan(CELL * 0.5);
    expect(diamond[2].color).toBe('#ffffff');
    expect(flying.motes.filter((mote) => mote.shape === 'lick')).toHaveLength(2);
    expect(flying.motes.some((mote) => mote.shape === 'star')).toBe(true);
  });

  it('flashes and throws sparks where it strikes, and leaves nothing of its own', () => {
    expect(arcaneAt(LANDS + 0.05).motes.filter((mote) => mote.shape === 'spark').length).toBeGreaterThan(5);
    expect(arcaneAt(LANDS + 0.5).motes).toHaveLength(0);
    expect(arcaneAt(LANDS + 0.5).ribbons).toHaveLength(0);
  });
});
