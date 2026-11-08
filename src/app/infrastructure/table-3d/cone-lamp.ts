import { lightTargetDirection, renderGroup, smoothstep, uniform } from 'three/tsl';
import { type NodeBuilder, type NodeFrame, Object3D, PointLight, PointLightNode } from 'three/webgpu';

/**
 * How far round from the way it is thrown a lamp's light still reaches, in the cosine of the angle,
 * for a lamp that throws it all round: below what any direction makes, so its cone holds every one.
 */
const ALL_ROUND_EDGE = -3;
const ALL_ROUND_FULL = -2;

/**
 * A lamp that throws its light all round, or one way in a cone, its shadows worked out all round
 * either way: a lamp thrown one way lights nothing outside its cone, so the shadows it throws are the
 * same, and every lamp of the scene asks the graphics card for the same picture of its shadows. Each
 * picture a surface reads its shadows from counts against the few a graphics card lets it read; a
 * lamp of each kind in every slot, so a slot could hold either, would read twice as many.
 */
export class ConeLamp extends PointLight {
  /** Half the width of the cone the light is thrown in, in radians; half a turn or more throws it all round. */
  angle = Math.PI;
  /** How much of the cone, from its edge in, the light fades over, as a share of it. */
  penumbra = 0;
  /** What the light is thrown towards, which only a lamp thrown one way heeds. */
  readonly target = new Object3D();

  /** Whether the lamp throws its light all round rather than one way. */
  get allRound(): boolean {
    return this.angle >= Math.PI;
  }
}

/** How the scene is lit by a {@link ConeLamp}: as a lamp all round, faded out past the edge of its cone. */
class ConeLampNode extends PointLightNode {
  /** How far round from the way the lamp is thrown its light is gone, in the cosine of the angle. */
  readonly edgeNode = uniform(ALL_ROUND_EDGE).setGroup(renderGroup);
  /** How far round from the way the lamp is thrown its light is still whole, in the cosine of the angle. */
  readonly fullNode = uniform(ALL_ROUND_FULL).setGroup(renderGroup);

  override update(frame: NodeFrame): boolean | undefined {
    const updated = super.update(frame);
    const lamp = this.light as ConeLamp;
    this.edgeNode.value = lamp.allRound ? ALL_ROUND_EDGE : Math.cos(lamp.angle);
    this.fullNode.value = lamp.allRound ? ALL_ROUND_FULL : Math.cos(lamp.angle * (1 - lamp.penumbra));
    return updated;
  }

  override setupDirect(builder: NodeBuilder) {
    const direct = super.setupDirect(builder) as unknown as ConeLampDirect;
    const towards = direct.lightDirection.dot(lightTargetDirection(this.light as ConeLamp));
    return {
      lightDirection: direct.lightDirection,
      lightColor: direct.lightColor.mul(smoothstep(this.edgeNode, this.fullNode, towards)),
    };
  }
}

/** The light a lamp casts on a point, as the library works it out: which way the lamp is, and its colour there. */
interface ConeLampDirect {
  readonly lightDirection: ReturnType<typeof lightTargetDirection>;
  readonly lightColor: ReturnType<typeof lightTargetDirection>;
}

ConeLamp.registerNode(ConeLampNode);
