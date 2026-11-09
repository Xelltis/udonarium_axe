import type {
  EffectBlend,
  EffectFloorMark,
  EffectFloorShape,
  EffectFrame,
  EffectMote,
  EffectMoteShape,
} from '@axe/domain/effect/scene/effect-scene';
import { LAID_OVER_FACES } from '@axe/infrastructure/table-3d/floor-order';
import {
  abs,
  atan,
  attribute,
  cameraPosition,
  clamp,
  cos,
  cross,
  float,
  fract,
  fwidth,
  length,
  max,
  min,
  mix,
  normalize,
  positionGeometry,
  pow,
  select,
  sin,
  smoothstep,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import {
  AdditiveBlending,
  type Camera,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  MeshBasicNodeMaterial,
  type Node,
  NormalBlending,
  PlaneGeometry,
  Vector3,
} from 'three/webgpu';

/** How many particles of each kind of blend the layer draws at most in a frame. */
export const MAX_EFFECT_MOTES = 4096;
/** How many marks on the floor of each kind of blend it draws at most. */
export const MAX_EFFECT_MARKS = 96;

/** Particles draw after the pieces and the lying pictures, and under the weather. */
const MOTES_ORDER = 940;
/** Marks on the floor draw over the floor and its pictures, and under what stands on it. */
const MARKS_ORDER = 2.5;
/** How far over the floor a mark lies, in table pixels, so the floor never shows through it. */
const MARK_LIFT_PX = 0.4;

const MOTE_SHAPES: readonly EffectMoteShape[] = ['glow', 'spark', 'puff', 'smoke', 'chunk', 'flake', 'star'];
const MARK_SHAPES: readonly EffectFloorShape[] = ['ring', 'disc', 'sigil', 'cracks', 'scorch'];

/** One instanced mesh of quads and the buffers it is drawn from, written afresh each frame. */
interface Batch {
  readonly mesh: Mesh;
  readonly geometry: InstancedBufferGeometry;
  readonly buffers: Record<string, InstancedBufferAttribute>;
}

/**
 * What the effects draw in the scene: their particles, each a quad turned to the eye or drawn out
 * along the way it flies, and their marks on the floor, each a quad lying on it, both in a batch of
 * light, added over what is behind it, and a batch of colour, laid over it. They are drawn among the
 * pieces and the walls, which hide them, and they hide nothing, writing no depth. Every batch is in the
 * scene from the start, drawing nothing while no effect plays, so the graphics card is readied for
 * them with the rest of the scene and never stops the table to be readied for one.
 */
export class EffectLayer {
  readonly group = new Group();
  private readonly cameraRight = uniform(new Vector3(1, 0, 0));
  private readonly cameraUp = uniform(new Vector3(0, 1, 0));
  private readonly motes: Record<EffectBlend, Batch>;
  private readonly marks: Record<EffectBlend, Batch>;
  private readonly colour = new Color();
  private changed = false;
  private drawing = false;

  constructor() {
    this.motes = { light: this.moteBatch('light'), color: this.moteBatch('color') };
    this.marks = { light: this.markBatch('light'), color: this.markBatch('color') };
  }

  /** How many particles and marks are drawn now. */
  get shown(): number {
    return [this.motes.light, this.motes.color, this.marks.light, this.marks.color].reduce(
      (sum, batch) => sum + batch.geometry.instanceCount,
      0
    );
  }

  /** Lays what the effects draw at a moment. */
  set(frame: EffectFrame): void {
    const empty = frame.motes.length === 0 && frame.floor.length === 0;
    if (empty && !this.drawing) return;
    this.drawing = !empty;
    for (const blend of ['light', 'color'] as const) {
      this.fillMotes(this.motes[blend], frame.motes, blend);
      this.fillMarks(this.marks[blend], frame.floor, blend);
    }
    this.changed = true;
  }

  /** Whether anything was laid since this was last asked, which wants drawing. */
  takeChanged(): boolean {
    const changed = this.changed;
    this.changed = false;
    return changed;
  }

  /** Turns the particles to the eye of the camera drawing them, as each draw begins. */
  private face(camera: Camera): void {
    this.cameraRight.value.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    this.cameraUp.value.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
  }

  dispose(): void {
    for (const batch of [this.motes.light, this.motes.color, this.marks.light, this.marks.color]) {
      batch.geometry.dispose();
      (batch.mesh.material as MeshBasicNodeMaterial).dispose();
    }
  }

  private fillMotes(batch: Batch, motes: readonly EffectMote[], blend: EffectBlend): void {
    const { place, tint, motion, look } = batch.buffers;
    let count = 0;
    for (const mote of motes) {
      if (mote.blend !== blend || count >= MAX_EFFECT_MOTES) continue;
      const at = count * 4;
      place.array[at] = mote.x;
      place.array[at + 1] = mote.z;
      place.array[at + 2] = mote.y;
      place.array[at + 3] = mote.size;
      this.colour.setStyle(mote.color);
      tint.array[at] = this.colour.r;
      tint.array[at + 1] = this.colour.g;
      tint.array[at + 2] = this.colour.b;
      tint.array[at + 3] = mote.alpha;
      motion.array[at] = mote.velocity?.x ?? 0;
      motion.array[at + 1] = mote.velocity?.z ?? 0;
      motion.array[at + 2] = mote.velocity?.y ?? 0;
      motion.array[at + 3] = mote.trail ?? 0;
      look.array[at] = MOTE_SHAPES.indexOf(mote.shape);
      look.array[at + 1] = mote.spin ?? 0;
      look.array[at + 2] = mote.variant ?? 0;
      look.array[at + 3] = mote.forward ?? 0;
      count++;
    }
    this.finish(batch, count);
  }

  private fillMarks(batch: Batch, marks: readonly EffectFloorMark[], blend: EffectBlend): void {
    const { place, tint, look } = batch.buffers;
    let count = 0;
    for (const mark of marks) {
      if (mark.blend !== blend || count >= MAX_EFFECT_MARKS) continue;
      const at = count * 4;
      place.array[at] = mark.x;
      place.array[at + 1] = mark.z + MARK_LIFT_PX;
      place.array[at + 2] = mark.y;
      place.array[at + 3] = mark.radius;
      this.colour.setStyle(mark.color);
      tint.array[at] = this.colour.r;
      tint.array[at + 1] = this.colour.g;
      tint.array[at + 2] = this.colour.b;
      tint.array[at + 3] = mark.alpha;
      look.array[at] = MARK_SHAPES.indexOf(mark.shape);
      look.array[at + 1] = mark.width;
      look.array[at + 2] = mark.turn;
      look.array[at + 3] = mark.seed;
      count++;
    }
    this.finish(batch, count);
  }

  private finish(batch: Batch, count: number): void {
    batch.geometry.instanceCount = count;
    for (const buffer of Object.values(batch.buffers)) {
      buffer.clearUpdateRanges();
      buffer.addUpdateRange(0, count * 4);
      buffer.needsUpdate = true;
    }
  }

  private batchOf(names: readonly string[], max: number, material: MeshBasicNodeMaterial, order: number): Batch {
    const plane = new PlaneGeometry(1, 1);
    const geometry = new InstancedBufferGeometry();
    geometry.index = plane.index;
    geometry.setAttribute('position', plane.getAttribute('position'));
    geometry.setAttribute('uv', plane.getAttribute('uv'));
    const buffers: Record<string, InstancedBufferAttribute> = {};
    for (const name of names) {
      const buffer = new InstancedBufferAttribute(new Float32Array(max * 4), 4);
      buffer.setUsage(DynamicDrawUsage);
      geometry.setAttribute(name, buffer);
      buffers[name] = buffer;
    }
    geometry.instanceCount = 0;
    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = order;
    mesh.onBeforeRender = (_renderer, _scene, camera) => this.face(camera);
    this.group.add(mesh);
    return { mesh, geometry, buffers };
  }

  /**
   * The particles of a blend: each a quad at its place, as wide as its size, turned to the eye and
   * about its middle by its spin; a spark drawn out behind it along the way it flies, as far as it
   * goes in its trail, and as wide as its size across it.
   */
  private moteBatch(blend: EffectBlend): Batch {
    const place = attribute<'vec4'>('place', 'vec4');
    const tint = attribute<'vec4'>('tint', 'vec4');
    const motion = attribute<'vec4'>('motion', 'vec4');
    const look = attribute<'vec4'>('look', 'vec4');
    const at = place.xyz;
    const toEye = normalize(cameraPosition.sub(at));
    const size = place.w;
    const velocity = motion.xyz;
    const speed = length(velocity);
    const along = select(speed.greaterThan(1), velocity.div(max(speed, 1)), this.cameraUp);
    const sideways = cross(along, toEye);
    const across = select(length(sideways).greaterThan(0.05), normalize(sideways), this.cameraRight);
    const streaked = motion.w.greaterThan(0).and(speed.greaterThan(1));
    const reach = speed.mul(motion.w).add(size);
    const corner = positionGeometry.xy;
    const spin = look.y;
    const turned = vec2(
      corner.x.mul(cos(spin)).sub(corner.y.mul(sin(spin))),
      corner.x.mul(sin(spin)).add(corner.y.mul(cos(spin)))
    );
    const faced = this.cameraRight.mul(turned.x).add(this.cameraUp.mul(turned.y)).mul(size);
    const drawnOut = across.mul(corner.x.mul(size)).add(along.mul(corner.y.sub(0.5).mul(reach)));

    const shape = look.x;
    const point = uv().sub(0.5).mul(2);
    const away = length(point);
    const blur = max(fwidth(away), 0.001);
    const round = clamp(float(1).sub(away), 0, 1);
    const glow = pow(round, 2);
    const heart = smoothstep(0.45, 0, away);
    const spark = smoothstep(0, 1, uv().y).mul(clamp(float(1).sub(abs(point.x)), 0, 1));
    const angle = atan(point.y, point.x);
    const variant = look.z;
    // A ball of flame: a hard edge that wavers round it, a lit cap and a shaded underside.
    const wavering = sin(angle.mul(3).add(variant.mul(5)))
      .mul(0.06)
      .add(sin(angle.mul(7).add(variant.mul(11))).mul(0.03))
      .add(0.9);
    const puff = clamp(wavering.sub(away).div(blur).add(0.5), 0, 1);
    const smoke = smoothstep(1, 0.15, away).mul(0.85);
    const edge = sin(angle.mul(3).add(variant.mul(3)))
      .mul(0.06)
      .add(sin(angle.mul(5).add(variant.mul(7))).mul(0.04))
      .add(0.82);
    const chunk = clamp(edge.sub(away).div(blur).add(0.5), 0, 1);
    const flake = max(
      clamp(float(1).sub(abs(point.x).mul(6)), 0, 1),
      clamp(float(1).sub(abs(point.y).mul(6)), 0, 1)
    ).mul(round);
    const star = clamp(float(1).sub(abs(point.x.mul(point.y)).mul(28)), 0, 1).mul(round);
    const alpha = select(
      shape.equal(0),
      glow,
      select(
        shape.equal(1),
        spark,
        select(
          shape.equal(2),
          puff,
          select(shape.equal(3), smoke, select(shape.equal(4), chunk, select(shape.equal(5), flake, star)))
        )
      )
    );
    // A chunk lit in hard steps, its lit face lighter, its underside darker, and outlined; smoke lit
    // softly on top. A ball of flame is built of balls a step apart in colour instead.
    const facing = point.x.mul(-0.5).add(point.y.mul(0.85));
    const chunkShade = select(
      away.greaterThan(edge.sub(0.2)),
      float(0.4),
      select(facing.greaterThan(0.18), float(1.3), select(facing.lessThan(-0.25), float(0.7), float(1)))
    );
    const lit = select(
      shape.equal(4),
      chunkShade,
      select(shape.equal(3), float(1.12).sub(uv().y.oneMinus().mul(0.4)), float(1))
    );
    const hot = select(
      shape.equal(0),
      heart.mul(0.7),
      select(shape.equal(1), smoothstep(0.6, 1, uv().y).mul(0.6), float(0))
    );
    const shown = mix(tint.rgb.mul(lit), vec3(1, 1, 1), blend === 'light' ? hot : float(0));

    const material = new MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: blend === 'light' ? AdditiveBlending : NormalBlending,
    });
    // Drawn nearer the eye along the line it is seen on, so it is in the same place on the screen and
    // only what stands in front of it by more than that hides it.
    const corner3 = at.add(select(streaked, drawnOut, faced));
    material.positionNode = corner3.add(normalize(cameraPosition.sub(corner3)).mul(look.w));
    material.colorNode = vec4(shown, 1);
    material.opacityNode = alpha.mul(tint.w);
    return this.batchOf(['place', 'tint', 'motion', 'look'], MAX_EFFECT_MOTES, material, MOTES_ORDER);
  }

  /**
   * The marks of a blend on the floor: each a quad lying on it at its place, as wide across as its
   * reach, turned about its middle: a ring, a soft disc, a sigil of rings and marks, cracks running
   * out from the middle, or a scorch with a ragged edge.
   */
  private markBatch(blend: EffectBlend): Batch {
    const place = attribute<'vec4'>('place', 'vec4');
    const tint = attribute<'vec4'>('tint', 'vec4');
    const look = attribute<'vec4'>('look', 'vec4');
    const corner = positionGeometry.xy;
    const lying = vec3(corner.x, 0, corner.y.negate()).mul(place.w.mul(2));

    const shape = look.x;
    const width = clamp(look.y, 0.01, 1);
    const turn = look.z;
    const seed = look.w;
    const point = uv().sub(0.5).mul(2);
    const away = length(point);
    const angle = atan(point.y, point.x).add(turn);
    const blur = max(fwidth(away), 0.0005);
    const band = (radius: Node<'float'>, thick: Node<'float'>) =>
      clamp(
        thick
          .sub(abs(away.sub(radius)))
          .div(blur)
          .add(0.5),
        0,
        1
      );
    const ring = band(float(1).sub(width.mul(0.5)), width.mul(0.5));
    const disc = smoothstep(1, 0.55, away);
    const ticks = smoothstep(0.82, 0.92, abs(sin(angle.mul(6))))
      .mul(band(float(0.78), float(0.06)))
      .add(band(float(0.62), width.mul(0.3)));
    const sigil = max(ring, min(ticks, float(1)));
    const spoke = abs(
      fract(
        angle
          .div(Math.PI * 2)
          .mul(7)
          .add(seed)
          .add(sin(away.mul(9).add(seed)).mul(0.04))
      ).sub(0.5)
    );
    const cracks = smoothstep(width.mul(0.5).mul(float(1).sub(away)).add(0.004), float(0), spoke).mul(
      smoothstep(1, 0.6, away)
    );
    const ragged = sin(angle.mul(3).add(seed))
      .mul(0.07)
      .add(sin(angle.mul(7).add(seed.mul(2))).mul(0.05))
      .add(sin(angle.mul(13).add(seed.mul(3))).mul(0.04))
      .add(sin(angle.mul(23).add(seed.mul(5))).mul(0.025))
      .add(0.62);
    const scorch = clamp(ragged.add(0.2).sub(away).div(blur).add(0.5), 0, 1);
    const alpha = select(
      shape.equal(0),
      ring,
      select(shape.equal(1), disc, select(shape.equal(2), sigil, select(shape.equal(3), cracks, scorch)))
    );

    const material = new MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: blend === 'light' ? AdditiveBlending : NormalBlending,
      ...LAID_OVER_FACES,
    });
    material.positionNode = place.xyz.add(lying);
    material.colorNode = vec4(tint.rgb, 1);
    material.opacityNode = alpha.mul(tint.w);
    return this.batchOf(['place', 'tint', 'look'], MAX_EFFECT_MARKS, material, MARKS_ORDER);
  }
}
