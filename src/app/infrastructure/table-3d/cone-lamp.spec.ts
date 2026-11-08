import { ConeLamp } from '@axe/infrastructure/table-3d/cone-lamp';
import { NodeFrame, PointLight } from 'three/webgpu';

/** What the scene is lit by a lamp through: how far round its light is gone, and how far round still whole. */
interface ConeNode {
  readonly edgeNode: { readonly value: number };
  readonly fullNode: { readonly value: number };
  update(frame: NodeFrame): unknown;
}

/** The node the library lights the scene by a lamp through, as it makes one for it, brought up to date. */
function litBy(lamp: ConeLamp): ConeNode {
  const make = (lamp as unknown as { _lightNode: new (light: ConeLamp) => ConeNode })._lightNode;
  const node = new make(lamp);
  node.update(new NodeFrame());
  return node;
}

describe('ConeLamp', () => {
  it('is lit by a node of its own rather than as a plain lamp all round', () => {
    const own = (new ConeLamp() as unknown as { _lightNode: unknown })._lightNode;

    expect(own).toBeDefined();
    expect(own).not.toBe((new PointLight() as unknown as { _lightNode: unknown })._lightNode);
  });

  it('reaches every way while it throws its light all round', () => {
    const node = litBy(new ConeLamp());

    expect(node.edgeNode.value).toBeLessThan(node.fullNode.value);
    expect(node.fullNode.value).toBeLessThan(-1);
  });

  it('fades out over the edge of the cone it is thrown in, whole inside it', () => {
    const lamp = new ConeLamp();
    lamp.angle = Math.PI / 4;
    lamp.penumbra = 0.3;

    const node = litBy(lamp);

    expect(node.edgeNode.value).toBeCloseTo(Math.cos(Math.PI / 4));
    expect(node.fullNode.value).toBeCloseTo(Math.cos((Math.PI / 4) * 0.7));
    expect(lamp.allRound).toBe(false);
  });
});
