import { hexChannels } from '@axe/core/util/hex-color';
import { nothingStaged, type Staged } from '@axe/domain/effect/scene/choreography';
import { rampOf } from '@axe/domain/effect/scene/effect-ramp';
import { type BlasterShot, drawBlasterShot } from '@axe/domain/effect/scene/shot/blaster-shot';

const CELL = 50;
const RAMP = rampOf('#fff3b0', '#ff2f14', 7);

function shotAt(seconds: number, fields: Partial<BlasterShot> = {}): Staged {
  const drawn = nothingStaged();
  drawBlasterShot(
    drawn,
    {
      from: { x: 100, y: 300, z: 30 },
      to: { x: 500, y: 300, z: 27 },
      cell: CELL,
      floorZ: 0,
      seconds,
      launch: 0,
      lands: 0.11,
      index: 0,
      shots: 1,
      seed: 5,
      ...fields,
    },
    RAMP
  );
  return drawn;
}

const boltOf = (drawn: Staged) => drawn.ribbons.filter((ribbon) => ribbon.points.length === 4);
const brightness = (color: string): number =>
  (hexChannels(color) ?? [0, 0, 0]).reduce((sum, channel) => sum + channel, 0);

describe('a shot of a blaster', () => {
  it('flies as a long bolt, white at its heart in its colour and a dark rim', () => {
    const bolt = boltOf(shotAt(0.08));
    const long = bolt[1].points[3].x - bolt[1].points[0].x;

    expect(bolt).toHaveLength(3);
    expect(long).toBeGreaterThan(CELL * 2);
    expect(brightness(bolt[0].color)).toBeLessThan(150);
    expect(bolt[2].color).toBe('#ffffff');
    expect(Math.max(...(bolt[0].widths as number[]))).toBeGreaterThan(Math.max(...(bolt[1].widths as number[])));
  });

  it('flashes at the muzzle with a ring opening about the line of fire, laid by halves', () => {
    const rings = (seconds: number) => shotAt(seconds).ribbons.filter((ribbon) => ribbon.about);
    const wide = (seconds: number) => Math.max(...rings(seconds)[0].points.map((point) => point.z));

    expect(rings(0.02).map((ring) => ring.half)).toEqual(['far', 'near']);
    expect(wide(0.1)).toBeGreaterThan(wide(0.02));
    expect(rings(0.2)).toEqual([]);
    expect(shotAt(0.02).lights.length).toBeGreaterThan(0);
  });

  it('leaves the line it flew hanging behind it after it has struck, fading', () => {
    const line = (seconds: number) => shotAt(seconds).ribbons.filter((ribbon) => ribbon.points.length === 3);

    expect(boltOf(shotAt(0.2))).toEqual([]);
    expect(line(0.2).length).toBeGreaterThan(0);
    expect(line(0.3)[0].alpha).toBeLessThan(line(0.2)[0].alpha);
    expect(line(0.45)).toEqual([]);
  });

  it('sprays light back the way it came where it strikes, and burns a spot that glows and smokes', () => {
    const struck = shotAt(0.2);
    const sparks = struck.motes.filter((mote) => mote.shape === 'spark');

    expect(sparks.length).toBeGreaterThan(8);
    expect(sparks.filter((spark) => spark.velocity!.x < 0).length).toBeGreaterThan(sparks.length * 0.7);
    expect(struck.floor.some((mark) => mark.blend === 'color')).toBe(true);
    expect(shotAt(0.5).motes.some((mote) => mote.shape === 'smoke')).toBe(true);
    expect(shotAt(1.2).floor).toEqual([]);
  });

  it('leaves the muzzle a little off the last for each shot of a burst, and from the muzzle itself alone', () => {
    const muzzle = (index: number, shots: number) => shotAt(0.2, { index, shots }).ribbons.at(-1)!.points[0];

    expect(muzzle(0, 1)).toEqual({ x: 100, y: 300, z: 30 });
    expect(muzzle(1, 6)).not.toEqual(muzzle(2, 6));
    expect(Math.hypot(muzzle(1, 6).x - 100, muzzle(1, 6).y - 300)).toBeLessThan(CELL * 0.3);
  });
});
