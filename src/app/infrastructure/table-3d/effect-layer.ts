import {
  EFFECT_FRAME_BUDGET,
  type EffectBlend,
  type EffectFloorMark,
  type EffectFloorShape,
  type EffectFrame,
  type EffectGround,
  type EffectMote,
  type EffectMoteShape,
  type EffectRibbon,
} from '@axe/domain/effect/scene/effect-scene';
import { SIGN_NAMES, type SignShape, signShapes } from '@axe/infrastructure/table-3d/effect-signs';
import { LAID_OVER_FACES } from '@axe/infrastructure/table-3d/floor-order';
import {
  abs,
  atan,
  attribute,
  cameraPosition,
  clamp,
  cos,
  cross,
  dot,
  float,
  floor,
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
const MAX_EFFECT_MOTES = EFFECT_FRAME_BUDGET.motes;
/** How many marks on the floor of each kind of blend it draws at most. */
const MAX_EFFECT_MARKS = EFFECT_FRAME_BUDGET.marks;

/** How far nearer the eye a particle is drawn at the least, against its size. */
const MOTE_NEARER_SIZE = 0.6;
/**
 * What a particle held to its own depth is told to the shader by: how far nearer the eye it is drawn,
 * taken below nothing and this much further, which no particle drawn the usual way ever is.
 */
const EXACT_DEPTH_MARK = 1;
/**
 * How near the eye a particle held to its own depth may come before it thins, as many times its own
 * size: nearer than the first it is not drawn at all, and further than the second it is drawn whole.
 */
const FILLS_VIEW_WITHIN = 0.7;
const CLEAR_OF_VIEW_BEYOND = 2;
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
  'heart',
  'zed',
  'query',
  'cross',
  'skull',
  'pentagram',
  'swirl',
  'dial',
  'eyes',
  'bubble',
  'hoop',
  'bar',
  'feather',
  'crag',
  'lick',
  'wisp',
  'jet',
  'gust',
  'blaze',
  'billow',
  'crystal',
];
/** The shapes that flow: see {@link EffectMoteShape}. They stand together in the list, from the first of them to the last. */
const FLOWING_FROM = MOTE_SHAPES.indexOf('lick');
const FLOWING_UNTIL = MOTE_SHAPES.indexOf('billow');
/** The shapes whose spin is no turn but something told of them, kept as it is: a crag, and those that flow and a crystal after it. */
const UNTURNED_FROM = MOTE_SHAPES.indexOf('crag');
/** The signs: see {@link EffectMoteShape}. They stand together in the list, from the first of them up to the crag. */
const SIGNS_FROM = MOTE_SHAPES.indexOf('heart');
/** How dark the outline of a sign is drawn, against its colour. */
const SIGN_INK = 0.24;
const MARK_SHAPES: readonly EffectFloorShape[] = [
  'ring',
  'disc',
  'sigil',
  'cracks',
  'scorch',
  'fissure',
  'crest',
  'rime',
  'seal',
];
/** How many glyphs are written round the band of a seal. */
const SEAL_GLYPHS = 24;
/** How far out the points of the star of a seal lie, as a share of its reach. */
const SEAL_STAR = 0.7;
/** The number each shape is told to the shaders by, from its place in the list, which the shaders tell the shapes apart by. */
const MOTE_SHAPE = Object.fromEntries(MOTE_SHAPES.map((shape, at) => [shape, at])) as Record<EffectMoteShape, number>;
const MARK_SHAPE = Object.fromEntries(MARK_SHAPES.map((shape, at) => [shape, at])) as Record<EffectFloorShape, number>;

/** One mesh of bands, two points to each point along a band, and the buffers it is drawn from, written afresh each frame. */
interface RibbonBatch {
  readonly mesh: Mesh;
  readonly geometry: BufferGeometry;
  readonly spine: BufferAttribute;
  readonly flow: BufferAttribute;
  readonly tint: BufferAttribute;
  readonly core: BufferAttribute;
  readonly fray: BufferAttribute;
  readonly hub: BufferAttribute;
  readonly index: BufferAttribute;
}

/** How many points along their bands the bands of each kind of blend may have in a frame. */
const MAX_RIBBON_POINTS = EFFECT_FRAME_BUDGET.ribbonPoints;
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
  /** Whether everything thins away as it comes close enough to the eye to fill the view, rather than only what is set to. */
  private readonly fromWithin = uniform(0);
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

  /**
   * Has everything drawn thin away as it comes close enough to the eye to fill the view, as what is
   * set to always does: for an eye standing among the effects, as one looking out of a piece does,
   * which an effect going off about it would otherwise cover with a flat sheet of its colour. An eye
   * over the table sees everything drawn whole.
   */
  seeFromWithin(within: boolean): void {
    const value = within ? 1 : 0;
    if (this.fromWithin.value === value) return;
    this.fromWithin.value = value;
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

  /** Lets go of the shapes and materials the motes, marks and ribbons are drawn with, and of the ground heights they follow. */
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
    const { place, tint, motion, look, core, aside } = batch.buffers;
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
      const shape = MOTE_SHAPE[mote.shape];
      look.array[at] = shape;
      // Turned within one round, as the shapes only take whole multiples of them: a graphics card
      // keeps too few figures to turn by a seed's worth. A shape that flows is told how far its
      // pattern has run as it is, which a round would cut short, and a crag what its spin holds.
      look.array[at + 1] = shape >= UNTURNED_FROM ? (mote.spin ?? 0) : withinRound(mote.spin ?? 0);
      look.array[at + 2] = withinRound(mote.variant ?? 0);
      look.array[at + 3] = nearerOf(mote);
      if (mote.core) {
        this.colour.setStyle(mote.core);
        core.array[at] = this.colour.r;
        core.array[at + 1] = this.colour.g;
        core.array[at + 2] = this.colour.b;
        core.array[at + 3] = 1;
      } else {
        core.array[at + 3] = 0;
      }
      aside.array[at] = mote.aside?.right ?? 0;
      aside.array[at + 1] = mote.aside?.up ?? 0;
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
      look.array[at] = MARK_SHAPE[mark.shape];
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
    const { spine, flow, tint, core, fray, hub, index } = batch;
    let points = 0;
    let indices = 0;
    for (const ribbon of ribbons) {
      const count = ribbon.points.length;
      if (ribbon.blend !== blend || count < 2 || points + count > MAX_RIBBON_POINTS) continue;
      this.colour.setStyle(ribbon.color);
      const [r, g, b] = [this.colour.r, this.colour.g, this.colour.b];
      this.colour.setStyle(ribbon.core ?? ribbon.color);
      const [cr, cg, cb] = [this.colour.r, this.colour.g, this.colour.b];
      const frays = (ribbon.torn ?? 0) > 0 || (ribbon.soft ?? 0) > 0;
      const widest = frays ? widestOf(ribbon) : 1;
      const half = ribbon.about ? HALF_MARK[ribbon.half ?? 'whole'] : 0;
      let run = -(ribbon.flowed ?? 0);
      for (let at = 0; at < count; at++) {
        const point = ribbon.points[at];
        const before = ribbon.points[Math.max(0, at - 1)];
        const after = ribbon.points[Math.min(count - 1, at + 1)];
        const width = typeof ribbon.widths === 'number' ? ribbon.widths : (ribbon.widths[at] ?? 0);
        const alpha = ribbon.alpha * (ribbon.alphas?.[at] ?? 1);
        if (frays && at > 0) run += Math.hypot(point.x - before.x, point.y - before.y, point.z - before.z) / widest;
        const about = half !== 0 ? (ribbon.about?.[at] ?? point) : point;
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
          fray.array[at4] = frays ? run : 0;
          fray.array[at4 + 1] = ribbon.torn ?? 0;
          fray.array[at4 + 2] = ribbon.soft ?? 0;
          fray.array[at4 + 3] = ribbon.leans ?? 0;
          hub.array[at4] = about.x;
          hub.array[at4 + 1] = about.z;
          hub.array[at4 + 2] = about.y;
          hub.array[at4 + 3] = half + (ribbon.thins ? THINS_MARK : 0);
        }
        if (at < count - 1) {
          const a = (points + at) * 2;
          index.array.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], indices);
          indices += 6;
        }
      }
      points += count;
    }
    for (const attribute of [spine, flow, tint, core, fray, hub]) {
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
   * the eye; hard at its edge, its colour taken to its core's in its middle. One that frays has its
   * edges eaten by the pattern the shapes that flow share, run down it, and may thin softly to them;
   * one drawn by halves shows only where it passes before what it winds about, or only behind it.
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
    const fray = made('fray');
    const hub = made('hub');
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
    const frayNode = attribute<'vec4'>('fray', 'vec4');
    const hubNode = attribute<'vec4'>('hub', 'vec4');
    const torn = frayNode.y;
    const softness = frayNode.z;
    const frays = torn.greaterThan(0).or(softness.greaterThan(0));
    const grainAt = vec2(flowNode.w.mul(1.6), frayNode.x.mul(0.8));
    const coarse = softNoise(grainAt);
    const fine = softNoise(grainAt.mul(2.3).add(17));
    const eaten = coarse.mul(0.65).add(fine.mul(0.35));
    const field = float(1).sub(side).sub(eaten.mul(torn));
    const frayed = select(
      softness.greaterThan(0),
      smoothstep(0, max(softness, 0.001), field).mul(fine.mul(0.4).add(0.6)),
      clamp(field.div(max(fwidth(field), 0.001)).add(0.5), 0, 1)
    );
    const heart = smoothstep(0.75, 0.05, abs(flowNode.w.sub(frayNode.w))).mul(coreNode.w);
    // Which side of what it winds about a point of a band is on, as the eye sees it: the two halves of
    // a band drawn by halves add up to the whole of it.
    const outward = spineNode.xyz.sub(hubNode.xyz);
    const facing = dot(outward.div(max(length(outward), 0.0001)), toEye);
    const nearSide = smoothstep(-0.2, 0.2, facing);
    // A band that thins near the eye is told so by a mark added to which half of it is drawn.
    const thins = hubNode.w.greaterThan(THINS_MARK / 2);
    const halfMark = hubNode.w.sub(select(thins, float(THINS_MARK), float(0)));
    const halved = select(
      halfMark.greaterThan(0.5),
      nearSide,
      select(halfMark.lessThan(-0.5), float(1).sub(nearSide), float(1))
    );
    const closeness = length(cameraPosition.sub(spineNode.xyz)).div(max(spineNode.w, 1));
    const seenFromWithin = select(
      thins.or(this.fromWithin.greaterThan(0.5)),
      smoothstep(FILLS_VIEW_WITHIN, CLEAR_OF_VIEW_BEYOND, closeness),
      float(1)
    );
    const material = new MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      ...this.blendingOf(blend),
    });
    material.positionNode = placed.add(normalize(cameraPosition.sub(placed)).mul(RIBBON_NEARER_PX));
    material.colorNode = vec4(mix(tintNode.rgb, coreNode.rgb, heart), 1);
    material.opacityNode = select(frays, frayed, edge).mul(tintNode.w).mul(halved).mul(seenFromWithin);
    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = RIBBONS_ORDER;
    mesh.visible = false;
    this.group.add(mesh);
    return { mesh, geometry, spine, flow, tint, core, fray, hub, index };
  }

  /**
   * The particles of a blend: each a quad at its place, as wide as its size, turned to the eye and
   * about its middle by its spin; a spark drawn out behind it along the way it flies, as far as it
   * goes in its trail, and as wide as its size across it. One held to its own depth is drawn nearer
   * the eye by what it is set to and no more, so a piece standing before it hides it, and thins away
   * as it comes close enough to the eye to fill the view. One set off across the screen is drawn as far
   * to the right of its place and up from it as it is set, as the eye sees them.
   */
  private moteBatch(blend: EffectBlend): Batch {
    const place = attribute<'vec4'>('place', 'vec4');
    const tint = attribute<'vec4'>('tint', 'vec4');
    const motion = attribute<'vec4'>('motion', 'vec4');
    const look = attribute<'vec4'>('look', 'vec4');
    const core = attribute<'vec4'>('core', 'vec4');
    const aside = attribute<'vec4'>('aside', 'vec4');
    const at = place.xyz.add(this.cameraRight.mul(aside.x)).add(this.cameraUp.mul(aside.y));
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
    // Rounded, as it is told apart by being equal to a whole number: carried to each point of the
    // board, a whole number may come out a hair off it at some points, which a look would then be
    // drawn as another at, in thin stripes.
    const shape = floor(look.x.add(0.5));
    // A flare is drawn out as long as its trail says, then turned by its spin, so a star of them
    // can be laid out at any angles on the screen.
    const stretch = select(shape.equal(MOTE_SHAPE.flare), max(motion.w, 1), float(1));
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
    const signs = signShapes(point, away, angle, variant);
    const isSign = shape.greaterThanEqual(SIGNS_FROM).and(shape.lessThan(UNTURNED_FROM));
    const signOf = (pick: (sign: SignShape) => Node<'float'>): Node<'float'> =>
      SIGN_NAMES.slice(1).reduce<Node<'float'>>(
        (rest, name) => select(shape.equal(MOTE_SHAPE[name]), pick(signs[name]), rest),
        pick(signs[SIGN_NAMES[0]])
      );
    const signAlpha = signOf((sign) => sign.alpha);
    const signFill = signOf((sign) => sign.fill);
    // A crag of rock, drawn out from its root to its tip: two faces meeting in a ridge, the one lit
    // and the other in shadow, beds of stone running across each and meeting at the ridge, notches
    // chipped out of its edges, a dark outline; broken off short of its tip by as much as its spin
    // says in whole hundredths, and veins of its core's colour climbing it as far as the rest of its spin.
    const cragLong = up.mul(reach.div(max(size, 1)));
    const cragBroken = floor(spin).div(100);
    const cragClimbed = fract(spin);
    const cragSide = select(point.x.greaterThan(0), float(1), float(0));
    const cragNotch = gridNoise(vec2(floor(cragLong.mul(2.4).add(variant.mul(7))), cragSide.add(floor(variant.mul(3)))))
      .mul(0.16)
      .mul(smoothstep(0.03, 0.14, up));
    const cragWidth = pow(clamp(float(1).sub(up), 0, 1), 0.62)
      .mul(0.97)
      .sub(cragNotch);
    const cragJag = gridNoise(vec2(floor(point.x.mul(2.6).add(variant.mul(5))), floor(variant.mul(11)))).mul(0.09);
    const cragTop = float(1)
      .sub(cragBroken)
      .sub(cragJag.mul(select(cragBroken.greaterThan(0), float(1), float(0))))
      .sub(up);
    const cragEdge = cragWidth.sub(abs(point.x));
    const crag = clamp(cragEdge.div(max(fwidth(point.x), 0.001)).add(0.5), 0, 1).mul(
      clamp(cragTop.div(max(fwidth(up), 0.0005)).add(0.5), 0, 1)
    );
    const cragRidge = sin(variant.mul(9))
      .mul(0.3)
      .mul(float(1).sub(up))
      .add(sin(cragLong.mul(1.7).add(variant.mul(4))).mul(0.035));
    const cragAside = point.x.sub(cragRidge);
    const cragLit = cragAside.lessThan(0);
    const cragBed = cragLong
      .mul(2.6)
      .add(abs(cragAside).mul(select(cragLit, float(1.5), float(0.7))))
      .add(softNoise(vec2(point.x.mul(1.4).add(variant), cragLong.mul(0.9))).mul(0.7));
    const cragSeam = select(fract(cragBed).lessThan(0.13), float(0.72), float(1));
    const cragLayer = select(
      softNoise(vec2(variant.mul(3), cragBed.mul(0.55))).greaterThan(0.56),
      float(1.14),
      float(0.96)
    );
    const cragCrest = select(cragLit.and(cragAside.greaterThan(-0.09)), float(1.22), float(1));
    const cragOutlined = cragEdge
      .lessThan(0.1)
      .or(cragTop.lessThan(select(cragBroken.greaterThan(0), float(0.012), float(0))));
    const cragShade = select(
      cragOutlined,
      float(0.4),
      select(cragLit, float(1.38), float(0.62)).mul(cragSeam).mul(cragLayer).mul(cragCrest)
    );
    const cragZig = abs(fract(cragLong.mul(1.15).add(variant)).sub(0.5))
      .sub(0.25)
      .mul(0.5);
    const cragVeinOff = min(
      abs(cragAside.sub(cragZig)),
      abs(cragAside.add(float(0.42).mul(float(1).sub(up))).add(cragZig.mul(1.4))).add(0.02)
    );
    const cragVeined = max(smoothstep(0.05, 0.03, cragVeinOff), smoothstep(0.22, 0.02, cragVeinOff).mul(0.45))
      .mul(smoothstep(cragClimbed, cragClimbed.sub(0.06), up))
      .mul(select(cragClimbed.greaterThan(0.001), float(1), float(0)))
      .mul(core.w);
    // A crystal of ice, drawn out from its root to its tip as a crag is and broken off as one: a
    // straight-sided column cut to a point from its shoulder up, its faces meeting in a ridge, the one
    // lit and the rest taken towards its core's colour, a bevel down each edge and an outline of that
    // colour; white down the lit side of its ridge, in a glint on its shoulder, in the rime at its
    // foot and in the cracks that climb it as far as the rest of its spin; pale streaks frozen into it.
    const iceShoulder = sin(variant.mul(7)).mul(0.16).add(0.6);
    const iceTaper = clamp(float(1).sub(up).div(float(1).sub(iceShoulder)), 0, 1);
    const iceHalf = iceTaper.mul(0.84);
    const iceAside = point.x.sub(sin(variant.mul(13)).mul(0.3).mul(float(1).sub(iceTaper)));
    const iceEdge = iceHalf.sub(abs(iceAside));
    const ice = clamp(iceEdge.div(max(fwidth(point.x), 0.001)).add(0.5), 0, 1).mul(
      clamp(cragTop.div(max(fwidth(up), 0.0005)).add(0.5), 0, 1)
    );
    const iceAcross = iceAside.div(max(iceHalf, 0.001));
    const iceOff = iceAcross.sub(sin(variant.mul(9)).mul(0.3));
    const iceOutlined = iceEdge
      .lessThan(0.085)
      .or(cragTop.lessThan(select(cragBroken.greaterThan(0), float(0.012), float(0))));
    const iceStreak = select(
      softNoise(vec2(iceAcross.mul(5).add(variant.mul(3)), cragLong.mul(0.5))).greaterThan(0.66),
      float(0.14),
      float(0)
    );
    const iceShadow = select(
      iceOutlined,
      float(1),
      clamp(
        select(
          iceOff.lessThan(0),
          select(iceAcross.lessThan(-0.72), float(0.3), float(0.02)),
          select(iceAcross.greaterThan(0.66), float(0.86), float(0.56))
        ).sub(iceStreak),
        0,
        1
      )
    ).mul(core.w);
    const iceCrest = select(iceOff.lessThan(0).and(iceOff.greaterThan(-0.17)), float(0.85), float(0));
    const iceSpot = smoothstep(
      0.26,
      0.2,
      abs(iceOff.add(0.42)).add(
        abs(up.sub(iceShoulder).add(0.07))
          .mul(reach.div(max(size, 1)))
          .mul(0.6)
      )
    );
    const iceCrackOff = min(
      abs(iceAside.sub(cragZig)),
      abs(iceAside.add(float(0.3).mul(float(1).sub(up))).add(cragZig.mul(1.4))).add(0.02)
    );
    const iceCracked = smoothstep(0.05, 0.025, iceCrackOff)
      .mul(smoothstep(cragClimbed, cragClimbed.sub(0.06), up))
      .mul(select(cragClimbed.greaterThan(0.001), float(1), float(0)));
    const iceWhite = select(
      iceOutlined,
      float(0),
      max(max(iceCrest, iceSpot), max(smoothstep(0.16, 0, up).mul(0.6), iceCracked))
    );
    const iceAlpha = ice.mul(select(iceOutlined, float(1), max(float(0.84), iceWhite)));
    // The shapes that flow share one pattern: two sizes of soft noise, drawn out the way the shape
    // runs and carried down it by its spin, which eats into the shape's edge, the more the nearer its tip.
    // A blaze and a billow are round, so their pattern is as fine along them as across.
    const rounded = shape.equal(MOTE_SHAPE.blaze).or(shape.equal(MOTE_SHAPE.billow));
    const flowAt = vec2(
      point.x.mul(2.1).add(variant.mul(5.3)),
      up
        .mul(reach.div(max(size, 1)))
        .mul(select(rounded, float(4.2), float(1.5)))
        .sub(spin)
    );
    const coarse = softNoise(flowAt);
    const fine = softNoise(flowAt.mul(2.3).add(17));
    const eaten = coarse.mul(0.65).add(fine.mul(0.35));
    const reachAcross = abs(point.x);
    const lickWidth = sqrt(clamp(up.mul(4), 0, 1))
      .mul(pow(float(1).sub(up), 0.4))
      .mul(0.95);
    const lickField = lickWidth.sub(reachAcross).sub(eaten.sub(0.3).mul(up.mul(1.25).add(0.14)));
    const wispWidth = sqrt(max(sin(up.mul(Math.PI)), 0));
    const wispField = wispWidth.sub(reachAcross).sub(eaten.sub(0.3).mul(0.8));
    const jetWidth = pow(up, 0.7)
      .mul(0.84)
      .add(0.16)
      .mul(
        sin(up.mul(11).sub(spin.mul(0.8)).add(variant.mul(3)))
          .mul(0.07)
          .mul(smoothstep(0.05, 0.3, up))
          .add(1)
      );
    const jetField = jetWidth
      .sub(reachAcross)
      .sub(eaten.sub(0.3).mul(smoothstep(0.15, 1, up).mul(0.95).add(0.12)))
      .sub(smoothstep(0.82, 1, up).mul(0.9));
    // A blaze and a billow: a round body as long as it is drawn out, its edge eaten into lobes by the
    // pattern, which rolls along it as it runs.
    const roundField = float(0.74)
      .sub(length(vec2(point.x, up.mul(2).sub(1))))
      .sub(eaten.sub(0.5).mul(0.52));
    const soft = shape.equal(MOTE_SHAPE.wisp).or(shape.equal(MOTE_SHAPE.gust)).or(shape.equal(MOTE_SHAPE.billow));
    const coned = shape.equal(MOTE_SHAPE.jet).or(shape.equal(MOTE_SHAPE.gust));
    const field = select(
      rounded,
      roundField,
      select(coned, jetField, select(shape.equal(MOTE_SHAPE.wisp), wispField, lickField))
    );
    const widthThere = select(coned, jetWidth, float(1));
    // A billow is thick: it thins only at its very edge and is not thinned by the pattern within.
    const billowed = shape.equal(MOTE_SHAPE.billow);
    const flowing = select(
      soft,
      select(
        billowed,
        smoothstep(0, 0.2, field),
        smoothstep(0, widthThere.mul(0.45).add(0.04), field).mul(fine.mul(0.45).add(0.55))
      ),
      clamp(field.div(max(fwidth(field), 0.001)).add(0.5), 0, 1)
    );
    // The middle of a shape that flows, in two steps towards its core's colour: the heart of a jet is
    // widest at its root and gone before its end.
    const heartFrom = select(coned, widthThere.mul(up.mul(0.55).add(0.42)), float(0.34));
    const bodyFrom = select(coned, widthThere.mul(up.mul(0.3).add(0.16)), float(0.16));
    const cored = select(
      soft,
      smoothstep(bodyFrom, heartFrom.add(0.1), field),
      smoothstep(bodyFrom, bodyFrom.add(0.02), field)
        .mul(0.5)
        .add(smoothstep(heartFrom, heartFrom.add(0.02), field).mul(0.5))
    ).mul(core.w);
    const flows = shape.greaterThanEqual(FLOWING_FROM).and(shape.lessThanEqual(FLOWING_UNTIL));
    const crystalline = shape.equal(MOTE_SHAPE.crystal);
    const alpha = select(
      flows,
      flowing,
      select(
        isSign,
        signAlpha,
        select(
          shape.equal(MOTE_SHAPE.glow),
          glow,
          select(
            shape.equal(MOTE_SHAPE.spark),
            spark,
            select(
              shape.equal(MOTE_SHAPE.puff),
              puff,
              select(
                shape.equal(MOTE_SHAPE.smoke),
                smoke,
                select(
                  shape.equal(MOTE_SHAPE.chunk),
                  chunk,
                  select(
                    shape.equal(MOTE_SHAPE.flake),
                    flake,
                    select(
                      shape.equal(MOTE_SHAPE.star),
                      star,
                      select(
                        shape.equal(MOTE_SHAPE.tongue),
                        tongue,
                        select(
                          shape.equal(MOTE_SHAPE.flare),
                          flare,
                          select(
                            shape.equal(MOTE_SHAPE.comet),
                            comet,
                            select(shape.equal(MOTE_SHAPE.crag), crag, select(crystalline, iceAlpha, plume))
                          )
                        )
                      )
                    )
                  )
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
      isSign,
      mix(float(SIGN_INK), float(1), signFill),
      select(
        shape.equal(MOTE_SHAPE.chunk),
        chunkShade,
        select(
          shape.equal(MOTE_SHAPE.crag),
          cragShade,
          select(
            shape.equal(MOTE_SHAPE.smoke).or(shape.equal(MOTE_SHAPE.plume)),
            float(1.12).sub(uv().y.oneMinus().mul(0.4)),
            select(billowed, float(1.6).sub(uv().y.oneMinus().mul(0.65)).sub(eaten.mul(0.85)), float(1))
          )
        )
      )
    );
    const hot = select(
      shape.equal(MOTE_SHAPE.glow),
      heart.mul(0.7),
      select(
        shape.equal(MOTE_SHAPE.spark),
        smoothstep(0.6, 1, uv().y).mul(0.6),
        select(
          shape.equal(MOTE_SHAPE.flare),
          pow(clamp(float(1).sub(abs(point.y).mul(2.5)), 0, 1), 2).mul(0.8),
          float(0)
        )
      )
    );
    const body = mix(
      tint.rgb.mul(lit),
      core.rgb,
      select(
        flows,
        cored,
        select(
          shape.equal(MOTE_SHAPE.crag),
          cragVeined,
          select(crystalline, iceShadow, select(shape.equal(MOTE_SHAPE.skull), signs.skull.cored.mul(core.w), float(0)))
        )
      )
    );
    const glinting = select(
      shape.equal(MOTE_SHAPE.bubble),
      signs.bubble.cored,
      select(crystalline, iceWhite, float(0))
    );
    const shown = mix(mix(body, vec3(1, 1, 1), blend === 'light' ? hot : float(0)), vec3(1, 1, 1), glinting);

    const material = new MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      ...this.blendingOf(blend),
    });
    // Drawn nearer the eye along the line it is seen on, so it is in the same place on the screen and
    // only what stands in front of it by more than that hides it: by as much as it is set to, and by
    // more than half its size for a large one, whose board, turned to the eye, would otherwise sink
    // its lower half into the ground under it and be cut by every rise of the ground in thin stripes.
    const corner3 = at.add(select(streaked, drawnOut, faced));
    const exact = look.w.lessThan(0);
    const nearer = select(exact, look.w.negate().sub(EXACT_DEPTH_MARK), max(look.w, size.mul(MOTE_NEARER_SIZE)));
    // A shape that flows is drawn out far from where it is set, so each point of it thins by how close
    // that point is to the eye: seen from the mouth it is blown from, only its far part shows.
    const fromEye = length(cameraPosition.sub(select(flows, corner3, at)));
    const closeness = fromEye.div(max(size, 1));
    // Seen from among the effects, one drawn out is measured by its length, as a flare or a spark the
    // eye stands at the root of fills the view down the whole of it.
    const longest = select(flows, size, select(streaked, max(reach, size), size.mul(stretch)));
    const seenFromWithin = select(
      this.fromWithin.greaterThan(0.5),
      smoothstep(FILLS_VIEW_WITHIN, CLEAR_OF_VIEW_BEYOND, fromEye.div(max(longest, 1))),
      select(exact, smoothstep(FILLS_VIEW_WITHIN, CLEAR_OF_VIEW_BEYOND, closeness), float(1))
    );
    material.positionNode = corner3.add(normalize(cameraPosition.sub(corner3)).mul(nearer));
    material.colorNode = vec4(shown, 1);
    material.opacityNode = alpha.mul(tint.w).mul(seenFromWithin);
    return this.batchOf(['place', 'tint', 'motion', 'look', 'core', 'aside'], MAX_EFFECT_MOTES, material, MOTES_ORDER);
  }

  /**
   * The marks of a blend on the floor: each a quad lying on it at its place, as wide across as its
   * reach, turned about its middle: a ring, a soft disc, a sigil of rings and marks, cracks running
   * out from the middle, a scorch with a ragged edge, a fissure run across it the way it is turned, a
   * crest, a seal of rings, a star of two squares and a cross, a rime, a patch of hoar frost, or a
   * seal written round as its seed says: with an even seed a band of glyphs between rims, and with an
   * odd one a star of five points within a ring, with rings about its points and its heart.
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

    // Rounded, as it is told apart by being equal to a whole number: carried to each point of the
    // board, a whole number may come out a hair off it at some points, which a look would then be
    // drawn as another at, in thin stripes.
    const shape = floor(look.x.add(0.5));
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
    // A fissure: a crack run from one end of the mark to the other along the way it is turned,
    // jagged, widest in its middle and drawn to a point at each end, two lesser cracks branching off it.
    const run = point.x.mul(cos(turn)).add(point.y.mul(sin(turn)));
    const off = point.y.mul(cos(turn)).sub(point.x.mul(sin(turn)));
    const zigzag = (at: Node<'float'>, rate: number, shift: number) =>
      abs(fract(at.mul(rate).add(seed.mul(shift))).sub(0.5)).sub(0.25);
    const fissureLine = zigzag(run, 2.3, 1)
      .mul(0.34)
      .add(zigzag(run, 6.1, 1.7).mul(0.12));
    const fissureWide = width.mul(pow(clamp(float(1).sub(abs(run)), 0, 1), 0.6));
    const cut = (field: Node<'float'>) => clamp(field.div(max(fwidth(off), 0.0005)).add(0.5), 0, 1);
    const branch = (from: number, slope: number, long: number) => {
      const along = run.sub(from).mul(Math.sign(long));
      const share = along.div(Math.abs(long));
      const line = fissureLine.add(along.mul(slope)).add(zigzag(run, 5.3, 2.9).mul(0.1).mul(share));
      const wide = width.mul(0.6).mul(clamp(float(1).sub(share), 0, 1));
      return cut(wide.sub(abs(off.sub(line)))).mul(select(along.greaterThan(0), float(1), float(0)));
    };
    const fissure = max(
      cut(fissureWide.sub(abs(off.sub(fissureLine)))),
      max(branch(-0.25, 0.55, 0.55), branch(0.2, -0.5, -0.6))
    );
    // A crest: a doubled rim with ticks between its rings, two squares crossed into a star of eight
    // points within it, and a ring about a cross at its heart, all of one weight of line.
    const crestAt = vec2(cos(angle), sin(angle)).mul(away);
    const crestTurned = vec2(crestAt.x.add(crestAt.y), crestAt.y.sub(crestAt.x)).mul(Math.SQRT1_2);
    const crestLine = max(width.mul(0.3), 0.012);
    const crestInk = (off: Node<'float'>, thick: Node<'float'>) => clamp(thick.sub(off).div(blur).add(0.5), 0, 1);
    const crestSquare = (at: Node<'vec2'>) => crestInk(abs(max(abs(at.x), abs(at.y)).sub(0.58)), crestLine);
    const crestTicks = smoothstep(0.86, 0.94, abs(sin(angle.mul(12)))).mul(band(float(0.9), float(0.045)));
    const crestCross = crestInk(min(abs(crestAt.x), abs(crestAt.y)), crestLine.mul(0.8)).mul(
      crestInk(away, float(0.36))
    );
    const crest = max(
      max(band(float(1).sub(crestLine), crestLine), band(float(0.82), crestLine.mul(0.8))),
      max(
        max(crestSquare(crestAt), crestSquare(crestTurned)),
        max(max(band(float(0.36), crestLine.mul(0.8)), crestCross), crestTicks)
      )
    );
    // A rime: hoar frost grown out from its middle into needles of uneven length, mottled within, and
    // thinning to the patches about its middle as its width falls.
    const needleAt = angle
      .div(Math.PI * 2)
      .mul(84)
      .add(seed);
    const needleLong = gridNoise(vec2(floor(needleAt), floor(seed).add(3)));
    const needleIn = float(1).sub(abs(fract(needleAt).sub(0.5)).mul(2));
    const rimeReach = needleLong.mul(0.36).mul(pow(needleIn, 0.7)).add(0.6);
    const rimeAt = point.mul(6).add(seed);
    const rimeFine = softNoise(rimeAt.mul(2.7).add(11));
    const rimeLies = softNoise(rimeAt).mul(0.6).add(rimeFine.mul(0.4)).add(float(1).sub(away).mul(0.45));
    const rime = smoothstep(0, 0.07, rimeReach.sub(away))
      .mul(smoothstep(float(1).sub(width), float(1.3).sub(width), rimeLies))
      .mul(rimeFine.mul(0.5).add(0.5));
    const sealLine = max(width.mul(0.25), 0.004);
    const glyphLine = sealLine.mul(0.6);
    const sealInk = (off: Node<'float'>, thick: Node<'float'> | number) =>
      clamp((typeof thick === 'number' ? float(thick) : thick).sub(off).div(blur).add(0.5), 0, 1);
    const sealPattern = floor(seed);
    const sealRound = fract(angle.div(Math.PI * 2));
    const sealWritten = select(sealRound.lessThanEqual(float(1).sub(fract(seed))), float(1), float(0));
    const glyphAt = angle.div(Math.PI * 2).mul(SEAL_GLYPHS);
    const glyphIndex = floor(fract(floor(glyphAt).div(SEAL_GLYPHS)).mul(SEAL_GLYPHS).add(0.5));
    const glyphAcross = fract(glyphAt)
      .sub(0.5)
      .mul((Math.PI * 2 * 0.86) / SEAL_GLYPHS);
    const glyphUp = away.sub(0.86);
    const glyphPick = (stroke: number) =>
      select(gridNoise(vec2(glyphIndex, sealPattern.add(stroke))).greaterThan(0.45), float(1), float(0));
    const glyphTall = sealInk(abs(glyphUp), 0.055);
    const glyphWide = sealInk(abs(glyphAcross), 0.042);
    const glyph = max(
      max(
        sealInk(abs(glyphAcross.sub(gridNoise(vec2(glyphIndex, sealPattern)).sub(0.5).mul(0.05))), glyphLine).mul(
          glyphTall
        ),
        max(
          sealInk(abs(glyphUp.sub(0.055)), glyphLine)
            .mul(glyphWide)
            .mul(glyphPick(1)),
          sealInk(abs(glyphUp.add(0.055)), glyphLine)
            .mul(glyphWide)
            .mul(glyphPick(2))
        )
      ),
      max(
        sealInk(abs(glyphAcross.sub(glyphUp.mul(0.75))), glyphLine)
          .mul(glyphTall)
          .mul(glyphPick(3)),
        max(
          sealInk(abs(length(vec2(glyphAcross, glyphUp.sub(0.02))).sub(0.024)), glyphLine).mul(glyphPick(4)),
          sealInk(abs(glyphUp.sub(abs(glyphAcross).mul(1.2)).add(0.02)), glyphLine)
            .mul(glyphWide)
            .mul(glyphPick(5))
        )
      )
    );
    const sealTick = fract(angle.div(Math.PI * 2).mul(72))
      .sub(0.5)
      .mul((Math.PI * 2 * 0.965) / 72);
    const sealBand = max(
      max(
        band(float(0.985), sealLine.mul(1.4)),
        max(band(float(0.945), sealLine.mul(0.7)), band(float(0.775), sealLine.mul(0.7)))
      ),
      max(glyph, sealInk(abs(sealTick), glyphLine).mul(sealInk(abs(away.sub(0.965)), 0.012)))
    );
    const sealPoint = (index: number) => {
      const turned = Math.PI / 2 + (index * Math.PI * 2) / 5;
      return vec2(Math.cos(turned), Math.sin(turned));
    };
    const sealChord = (index: number) =>
      sealInk(abs(dot(crestAt, sealPoint(index)).sub(SEAL_STAR * Math.cos((Math.PI * 2) / 5))), sealLine);
    const sealNode = (index: number) =>
      sealInk(abs(length(crestAt.sub(sealPoint(index).mul(SEAL_STAR))).sub(0.075)), sealLine.mul(0.8));
    const sealStar = max(
      max(
        max(max(sealChord(0), sealChord(1)), max(sealChord(2), max(sealChord(3), sealChord(4)))).mul(
          sealInk(away, SEAL_STAR)
        ),
        max(max(sealNode(0), sealNode(1)), max(sealNode(2), max(sealNode(3), sealNode(4))))
      ),
      max(
        band(float(SEAL_STAR), sealLine),
        max(
          band(float(SEAL_STAR * Math.cos((Math.PI * 2) / 5)), sealLine.mul(0.8)),
          band(float(0.08), sealLine.mul(0.7))
        )
      )
    );
    const seal = select(fract(sealPattern.mul(0.5)).greaterThan(0.25), sealStar, sealBand).mul(sealWritten);
    const alpha = select(
      shape.equal(MARK_SHAPE.ring),
      ring,
      select(
        shape.equal(MARK_SHAPE.disc),
        disc,
        select(
          shape.equal(MARK_SHAPE.sigil),
          sigil,
          select(
            shape.equal(MARK_SHAPE.cracks),
            cracks,
            select(
              shape.equal(MARK_SHAPE.fissure),
              fissure,
              select(
                shape.equal(MARK_SHAPE.crest),
                crest,
                select(shape.equal(MARK_SHAPE.rime), rime, select(shape.equal(MARK_SHAPE.seal), seal, scorch))
              )
            )
          )
        )
      )
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

/**
 * How far nearer the eye a particle is drawn, as the shader is told it: what it is set to, for one
 * drawn the usual way, which the shader takes no less than a share of its size; and for one held to
 * its own depth, what it is set to taken below nothing and a mark further, which the shader reads back
 * and draws it by exactly.
 */
export function nearerOf(mote: Pick<EffectMote, 'forward' | 'exactDepth'>): number {
  const forward = Math.max(0, mote.forward ?? 0);
  return mote.exactDepth ? -(forward + EXACT_DEPTH_MARK) : forward;
}

/** What a band drawn by halves is told to the shader by: the half before what it winds about, the half behind it, or all of it. */
const HALF_MARK = { near: 1, far: -1, whole: 0 } as const;
/** What is added to that for a band that thins away where it comes close enough to the eye to fill the view. */
const THINS_MARK = 4;

/** How wide a band is at its widest, in table pixels, and never less than one: what its pattern is measured in. */
function widestOf(ribbon: EffectRibbon): number {
  const widest = typeof ribbon.widths === 'number' ? ribbon.widths : Math.max(0, ...ribbon.widths);
  return Math.max(widest, 1);
}

/** A number from 0 to 1 for each point of a grid, as good as random. */

function gridNoise(cell: Node<'vec2'>): Node<'float'> {
  return fract(sin(dot(cell, vec2(127.1, 311.7))).mul(43758.5453));
}

/** Noise that runs smoothly from each point of a grid to the next, from 0 to 1. */
function softNoise(at: Node<'vec2'>): Node<'float'> {
  const cell = floor(at);
  const within = fract(at);
  const eased = within.mul(within).mul(within.mul(-2).add(3));
  const low = mix(gridNoise(cell), gridNoise(cell.add(vec2(1, 0))), eased.x);
  const high = mix(gridNoise(cell.add(vec2(0, 1))), gridNoise(cell.add(vec2(1, 1))), eased.x);
  return mix(low, high, eased.y);
}

/** An angle taken within one round, from 0 to two pi. */
function withinRound(angle: number): number {
  const round = Math.PI * 2;
  return ((angle % round) + round) % round;
}
