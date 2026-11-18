import { READIED_ONE_BY_ONE, readyThings } from '@axe/infrastructure/table-3d/readying';
import { Object3D, Scene } from 'three/webgpu';

/** Lets every step waiting on a settled promise run. */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 5; turn++) await Promise.resolve();
}

describe('readyThings', () => {
  let scene: Scene;
  let begun: Object3D[];
  let finish: (() => void)[];
  let wholes: number;
  const ways = {
    one: (thing: Object3D) => {
      begun.push(thing);
      return new Promise<void>((resolve) => finish.push(resolve));
    },
    whole: () => {
      wholes++;
      return Promise.resolve();
    },
  };
  const thingsIn = (count: number) =>
    Array.from({ length: count }, () => {
      const thing = new Object3D();
      scene.add(thing);
      return thing;
    });

  beforeEach(() => {
    scene = new Scene();
    begun = [];
    finish = [];
    wholes = 0;
  });

  it('readies a few things one after another, none begun before the last is done', async () => {
    const things = thingsIn(3);
    const readied = readyThings(things, scene, ways);
    await settle();
    expect(begun).toEqual([things[0]]);

    finish.shift()!();
    await settle();
    expect(begun).toEqual([things[0], things[1]]);

    finish.shift()!();
    await settle();
    finish.shift()!();
    expect(await readied).toBe(true);
    expect(wholes).toBe(0);
  });

  it('readies more than a few with the whole scene at once', async () => {
    const things = thingsIn(READIED_ONE_BY_ONE + 1);

    expect(await readyThings(things, scene, ways)).toBe(true);
    expect(wholes).toBe(1);
    expect(begun).toEqual([]);
  });

  it('passes over a thing taken out of the scene meanwhile, however deep it stood, and says not all were readied', async () => {
    const [first, second, third] = thingsIn(3);
    const deep = new Object3D();
    second.add(deep);
    const readied = readyThings([first, deep, third], scene, ways);
    await settle();
    scene.remove(second);
    finish.shift()!();
    await settle();
    finish.shift()!();

    expect(await readied).toBe(false);
    expect(begun).toEqual([first, third]);
  });

  it('says not all were readied where a thing left the scene while the whole of it was readied', async () => {
    const things = thingsIn(READIED_ONE_BY_ONE + 1);
    const readied = readyThings(things, scene, {
      ...ways,
      whole: () => {
        scene.remove(things[4]);
        return Promise.resolve();
      },
    });

    expect(await readied).toBe(false);
  });

  it('begins nothing more once told to stop', async () => {
    const things = thingsIn(3);
    let stopped = false;
    const readied = readyThings(things, scene, { ...ways, stop: () => stopped });
    await settle();
    stopped = true;
    finish.shift()!();

    expect(await readied).toBe(false);
    expect(begun).toEqual([things[0]]);
  });

  it('goes on past a thing that cannot be readied, which is built on the frame that first draws it', async () => {
    const things = thingsIn(2);
    const readied = readyThings(things, scene, {
      ...ways,
      one: (thing) => (thing === things[0] ? Promise.reject(new Error('lost')) : Promise.resolve()),
    });

    expect(await readied).toBe(true);
    expect(
      await readyThings(thingsIn(READIED_ONE_BY_ONE + 1), scene, {
        ...ways,
        whole: () => Promise.reject(new Error('lost')),
      })
    ).toBe(true);
  });
});
