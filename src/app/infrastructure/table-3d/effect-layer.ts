import type {
  EffectBlend,
  EffectFloorMark,
  EffectFloorShape,
  EffectFrame,
  EffectGround,
  EffectMote,
  EffectMoteShape,
  EffectRibbon,
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
  sqrt,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  type Camera,
  Color,
  CustomBlending,
  DataTexture,
  DataUtils,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  HalfFloatType,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  LinearFilter,
  Mesh,
  MeshBasicNodeMaterial,
  type Node,
  NormalBlending,
  OneFactor,
  PlaneGeometry,
  RedFormat,
  SrcAlphaFactor,
  Vector2,
  Vector3,
  ZeroFactor,
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
/** How near the ground a mark's middle lies for it to be laid over the ground rather than flat, in table pixels. */
const MARK_ON_GROUND_PX = 3;
/** How many times a mark is split each way, to follow the ground over it. */
const MARK_SEGMENTS = 16;
/** The heights of flat ground, which no mark is laid over. */
const NO_GROUND = new DataTexture(new Uint16Array([0]), 1, 1, RedFormat, HalfFloatType);
/**
 * How far nearer the eye a mark on the floor is drawn, in table pixels, along the line it is seen on:
 * more than the ground painted high or low rises over a mark's breadth, and less than a wall stands off it.
 */
const MARK_NEARER_PX = 6;

const MOTE_SHAPES: readonly EffectMoteShape[] = [
  'glow',
  'spark',
  'puff',
  'smoke',
  'chunk',
  'flake',
  'star',
  'tongue',
  'flare',
  'comet',
  'plume',
];
const MARK_SHAPES: readonly EffectFloorShape[] = ['ring', 'disc', 'sigil', 'cracks', 'scorch'];

/** One mesh of bands, two points to each point along a band, and the buffers it is drawn from, written afresh each frame. */
interface RibbonBatch {
  readonly mesh: Mesh;
  readonly geometry: BufferGeometry;
  readonly spine: BufferAttribute;
  readonly flow: BufferAttribute;
  readonly tint: BufferAttribute;
  readonly core: BufferAttribute;
  readonly index: BufferAttribute;
}

/** How many points along their bands the bands of each kind of blend may have in a frame. */
const MAX_RIBBON_POINTS = 4096;
/** Bands draw with the particles. */
const RIBBONS_ORDER = 941;
/** How far nearer the eye a band is drawn along the line it is seen on, in table pixels, so a piece it passes does not cut it in two. */
const RIBBON_NEARER_PX = 12;

/** One instanced mesh of quads and the buffers it is drawn from, written afresh each frame. */
type BlendingParameters = Partial<
  Pick<MeshBasicNodeMaterial, 'blending' | 'blendSrc' | 'blendDst' | 'blendSrcAlpha' | 'blendDstAlpha'>
>;

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
  /** The heights of the ground the marks lie over, how far apart its samples are and how many, and whether there is any. */
  private readonly groundHeights = texture(NO_GROUND);
  private readonly groundStep = uniform(1);
  private readonly groundSize = uniform(new Vector2(1, 1));
  private readonly groundOn = uniform(0);
  private readonly motes: Record<EffectBlend, Batch>;
  private readonly marks: Record<EffectBlend, Batch>;
  private readonly ribbons: Record<EffectBlend, RibbonBatch>;
  private readonly colour = new Color();
  private changed = false;
  private drawing = false;

  /**
   * @param overPage Whether it is drawn on a canvas the page shows through, where light is to add to
   *   the page under it rather than cover it.
   */
  constructor(private readonly overPage = false) {
    this.motes = { light: this.moteBatch('light'), color: this.moteBatch('color') };
    this.marks = { light: this.markBatch('light'), color: this.markBatch('color') };
    this.ribbons = { light: this.ribbonBatch('light'), color: this.ribbonBatch('color') };
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
    const empty = frame.motes.length === 0 && frame.floor.length === 0 && frame.ribbons.length === 0;
    if (empty && !this.drawing) return;
    this.drawing = !empty;
    for (const blend of ['light', 'color'] as const) {
      this.fillMotes(this.motes[blend], frame.motes, blend);
      this.fillMarks(this.marks[blend], frame.floor, blend);
      this.fillRibbons(this.ribbons[blend], frame.ribbons, blend);
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

  /**
   * How a look of a blend is laid over what is drawn under it: light adds to it, colour covers it. Over
   * a canvas the page shows through, light adds its colour and leaves the canvas as see-through as it
   * was, so that the page under it is brightened rather than hidden.
   */
  private blendingOf(blend: EffectBlend): BlendingParameters {
    if (blend !== 'light') return { blending: NormalBlending };
    if (!this.overPage) return { blending: AdditiveBlending };
    return {
      blending: CustomBlending,
      blendSrc: SrcAlphaFactor,
      blendDst: OneFactor,
      blendSrcAlpha: ZeroFactor,
      blendDstAlpha: OneFactor,
    };
  }

  /** Lays the marks on the floor over the ground as it rises and falls, or flat with null. */
  setGround(ground: EffectGround | null): void {
    if (!ground) {
      this.groundOn.value = 0;
      return;
    }
    const halves = new Uint16Array(ground.heights.length);
    for (let index = 0; index < halves.length; index++) halves[index] = DataUtils.toHalfFloat(ground.heights[index]);
    const previous = this.groundHeights.value;
    const heights = new DataTexture(halves, ground.across, ground.down, RedFormat, HalfFloatType);
    heights.minFilter = LinearFilter;
    heights.magFilter = LinearFilter;
    heights.needsUpdate = true;
    this.groundHeights.value = heights;
    if (previous !== NO_GROUND) previous.dispose();
    this.groundStep.value = ground.stepPx;
    this.groundSize.value.set(ground.across, ground.down);
    this.groundOn.value = 1;
    this.changed = true;
  }

  dispose(): void {
    for (const batch of [this.motes.light, this.motes.color, this.marks.light, this.marks.color]) {
      batch.geometry.dispose();
      (batch.mesh.material as MeshBasicNodeMaterial).dispose();
    }
    for (const batch of [this.ribbons.light, this.ribbons.color]) {
      batch.geometry.dispose();
      (batch.mesh.material as MeshBasicNodeMaterial).dispose();
    }
    if (this.groundHeights.value !== NO_GROUND) this.groundHeights.value.dispose();
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
      // Turned within one round, as the shapes only take whole multiples of them: a graphics card
      // keeps too few figures to turn by a seed's worth.
      look.array[at + 1] = withinRound(mote.spin ?? 0);
      look.array[at + 2] = withinRound(mote.variant ?? 0);
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

  private batchOf(
    names: readonly string[],
    max: number,
    material: MeshBasicNodeMaterial,
    order: number,
    segments = 1
  ): Batch {
    const plane = new PlaneGeometry(1, 1, segments, segments);
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

  private fillRibbons(batch: RibbonBatch, ribbons: readonly EffectRibbon[], blend: EffectBlend): void {
    const { spine, flow, tint, core, index } = batch;
    let points = 0;
    let indices = 0;
    for (const ribbon of ribbons) {
      const count = ribbon.points.length;
      if (ribbon.blend !== blend || count < 2 || points + count > MAX_RIBBON_POINTS) continue;
      this.colour.setStyle(ribbon.color);
      const [r, g, b] = [this.colour.r, this.colour.g, this.colour.b];
      this.colour.setStyle(ribbon.core ?? ribbon.color);
      const [cr, cg, cb] = [this.colour.r, this.colour.g, this.colour.b];
      for (let at = 0; at < count; at++) {
        const point = ribbon.points[at];
        const before = ribbon.points[Math.max(0, at - 1)];
        const after = ribbon.points[Math.min(count - 1, at + 1)];
        const width = typeof ribbon.widths === 'number' ? ribbon.widths : (ribbon.widths[at] ?? 0);
        const alpha = ribbon.alpha * (ribbon.alphas?.[at] ?? 1);
        for (const side of [-1, 1]) {
          const vertex = (points + at) * 2 + (side > 0 ? 1 : 0);
          const at4 = vertex * 4;
          spine.array[at4] = point.x;
          spine.array[at4 + 1] = point.z;
          spine.array[at4 + 2] = point.y;
          spine.array[at4 + 3] = width;
          flow.array[at4] = after.x - before.x;
          flow.array[at4 + 1] = after.z - before.z;
          flow.array[at4 + 2] = after.y - before.y;
          flow.array[at4 + 3] = side;
          tint.array[at4] = r;
          tint.array[at4 + 1] = g;
          tint.array[at4 + 2] = b;
          tint.array[at4 + 3] = alpha;
          core.array[at4] = cr;
          core.array[at4 + 1] = cg;
          core.array[at4 + 2] = cb;
          core.array[at4 + 3] = ribbon.core ? 1 : 0;
        }
        if (at < count - 1) {
          const a = (points + at) * 2;
          index.array.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], indices);
          indices += 6;
        }
      }
      points += count;
    }
    for (const attribute of [spine, flow, tint, core]) {
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(0, points * 2 * 4);
      attribute.needsUpdate = true;
    }
    index.clearUpdateRanges();
    index.addUpdateRange(0, indices);
    index.needsUpdate = true;
    batch.geometry.setDrawRange(0, indices);
    batch.mesh.visible = indices > 0;
  }

  /**
   * The bands of a blend: each point of a band laid out either side of its line by half its width,
   * across the way the band runs and the way to the eye, so the band turns about its line to face
   * the eye; hard at its edge, its colour taken to its core's in its middle.
   */
  private ribbonBatch(blend: EffectBlend): RibbonBatch {
    const geometry = new BufferGeometry();
    const vertices = MAX_RIBBON_POINTS * 2;
    const made = (name: string) => {
      const buffer = new BufferAttribute(new Float32Array(vertices * 4), 4);
      buffer.setUsage(DynamicDrawUsage);
      geometry.setAttribute(name, buffer);
      return buffer;
    };
    // The geometry wants a position to count its points by; where each is drawn comes of the spine.
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(vertices * 3), 3));
    const spine = made('spine');
    const flow = made('flow');
    const tint = made('tint');
    const core = made('core');
    const index = new BufferAttribute(new Uint32Array((MAX_RIBBON_POINTS - 1) * 6), 1);
    index.setUsage(DynamicDrawUsage);
    geometry.setIndex(index);
    geometry.setDrawRange(0, 0);

    const spineNode = attribute<'vec4'>('spine', 'vec4');
    const flowNode = attribute<'vec4'>('flow', 'vec4');
    const tintNode = attribute<'vec4'>('tint', 'vec4');
    const coreNode = attribute<'vec4'>('core', 'vec4');
    const along = normalize(flowNode.xyz.add(vec3(0, 0.0001, 0)));
    const toEye = normalize(cameraPosition.sub(spineNode.xyz));
    // Seen end on, a band is drawn narrow, as it is, rather than as a stub as wide as its width.
    const sideways = cross(along, toEye);
    const seen = length(sideways);
    const across = sideways.div(max(seen, 0.0001));
    const broad = clamp(seen.div(0.6), 0, 1);
    const placed = spineNode.xyz.add(across.mul(spineNode.w.mul(0.5).mul(broad).mul(flowNode.w)));
    const side = abs(flowNode.w);
    const edge = clamp(
      float(1)
        .sub(side)
        .div(max(fwidth(side), 0.001))
        .add(0.5),
      0,
      1
    );
    const heart = smoothstep(0.75, 0.05, side).mul(coreNode.w);
    const material = new MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      ...this.blendingOf(blend),
    });
    material.positionNode = placed.add(normalize(cameraPosition.sub(placed)).mul(RIBBON_NEARER_PX));
    material.colorNode = vec4(mix(tintNode.rgb, coreNode.rgb, heart), 1);
    material.opacityNode = edge.mul(tintNode.w);
    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = RIBBONS_ORDER;
    mesh.visible = false;
    this.group.add(mesh);
    return { mesh, geometry, spine, flow, tint, core, index };
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
    const shape = look.x;
    // A flare is drawn out as long as its trail says, then turned by its spin, so a star of them
    // can be laid out at any angles on the screen.
    const stretch = select(shape.equal(8), max(motion.w, 1), float(1));
    const long = vec2(corner.x.mul(stretch), corner.y);
    const turned = vec2(
      long.x.mul(cos(spin)).sub(long.y.mul(sin(spin))),
      long.x.mul(sin(spin)).add(long.y.mul(cos(spin)))
    );
    const faced = this.cameraRight.mul(turned.x).add(this.cameraUp.mul(turned.y)).mul(size);
    const drawnOut = across.mul(corner.x.mul(size)).add(along.mul(corner.y.sub(0.5).mul(reach)));

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
    // A flare: a streak of light across the screen, thin and soft, brightest along its middle.
    const flare = pow(clamp(float(1).sub(abs(point.y)), 0, 1), 3).mul(
      pow(clamp(float(1).sub(abs(point.x)), 0, 1), 1.5)
    );
    // A tongue of flame, drawn out from its root up along the way it leans: round at the root,
    // widest a little above it and drawn to a point at its tip, its edge wavering.
    const up = uv().y;
    const tongueWidth = sqrt(clamp(up.mul(3.5), 0, 1))
      .mul(pow(float(1).sub(up), 0.7))
      .mul(
        sin(up.mul(9).add(variant.mul(5)))
          .mul(0.08)
          .add(1)
      );
    const tongue = clamp(
      tongueWidth
        .sub(abs(point.x))
        .div(max(fwidth(point.x), 0.001))
        .add(0.5),
      0,
      1
    );
    // A comet: a tongue the other way about, round at its head and drawn to a point behind it.
    const cometWidth = sqrt(clamp(float(1).sub(up).mul(3.5), 0, 1))
      .mul(pow(up, 0.7))
      .mul(
        sin(up.mul(7).add(variant.mul(5)))
          .mul(0.06)
          .add(1)
      );
    const comet = clamp(
      cometWidth
        .sub(abs(point.x))
        .div(max(fwidth(point.x), 0.001))
        .add(0.5),
      0,
      1
    );
    // A plume of smoke drawn out the way it rises: soft, round at both ends and thinning to its edge.
    const plumeWidth = pow(sin(up.mul(Math.PI)), 0.6).add(0.001);
    const plume = pow(clamp(float(1).sub(abs(point.x).div(plumeWidth)), 0, 1), 1.4).mul(0.85);
    const alpha = select(
      shape.equal(0),
      glow,
      select(
        shape.equal(1),
        spark,
        select(
          shape.equal(2),
          puff,
          select(
            shape.equal(3),
            smoke,
            select(
              shape.equal(4),
              chunk,
              select(
                shape.equal(5),
                flake,
                select(
                  shape.equal(6),
                  star,
                  select(shape.equal(7), tongue, select(shape.equal(8), flare, select(shape.equal(9), comet, plume)))
                )
              )
            )
          )
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
      select(shape.equal(3).or(shape.equal(10)), float(1.12).sub(uv().y.oneMinus().mul(0.4)), float(1))
    );
    const hot = select(
      shape.equal(0),
      heart.mul(0.7),
      select(
        shape.equal(1),
        smoothstep(0.6, 1, uv().y).mul(0.6),
        select(shape.equal(8), pow(clamp(float(1).sub(abs(point.y).mul(2.5)), 0, 1), 2).mul(0.8), float(0))
      )
    );
    const shown = mix(tint.rgb.mul(lit), vec3(1, 1, 1), blend === 'light' ? hot : float(0));

    const material = new MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      ...this.blendingOf(blend),
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
    const flat = place.xyz.add(vec3(corner.x, 0, corner.y.negate()).mul(place.w.mul(2)));
    // A mark laid where the ground under it is lies over the ground as it rises and falls; one laid
    // above it, on a block, lies flat.
    const groundAt = (x: Node<'float'>, z: Node<'float'>) =>
      this.groundHeights.sample(vec2(x, z).div(this.groundStep).add(0.5).div(this.groundSize)).level(float(0)).r;
    const onGround = this.groundOn
      .greaterThan(0.5)
      .and(abs(place.y.sub(MARK_LIFT_PX).sub(groundAt(place.x, place.z))).lessThan(MARK_ON_GROUND_PX));
    const laid = vec3(flat.x, select(onGround, groundAt(flat.x, flat.z).add(MARK_LIFT_PX), flat.y), flat.z);

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
      ...this.blendingOf(blend),
      ...LAID_OVER_FACES,
    });
    // Drawn nearer the eye along the line it is seen on, so where the ground rises a little under it
    // the mark is not lost in the ground; anything standing over it is drawn after it and covers it.
    material.positionNode = laid.add(normalize(cameraPosition.sub(laid)).mul(MARK_NEARER_PX));
    material.colorNode = vec4(tint.rgb, 1);
    material.opacityNode = alpha.mul(tint.w);
    return this.batchOf(['place', 'tint', 'look'], MAX_EFFECT_MARKS, material, MARKS_ORDER, MARK_SEGMENTS);
  }
}

/** An angle taken within one round, from 0 to two pi. */
function withinRound(angle: number): number {
  const round = Math.PI * 2;
  return ((angle % round) + round) % round;
}
