import { CAUSTIC_SEED, CAUSTIC_TILE_PX, causticAlpha, causticFieldOf } from '@axe/domain/effect/ambience/caustics';
import {
  cloudAlpha,
  iceCrackAlpha,
  scumRimTileAlpha,
  scumTileAlpha,
  smoothFieldOf,
  streakAlpha,
  WATER_PATTERN_TILE_PX,
} from '@axe/domain/effect/ambience/water-patterns';
import { ICE_BEARS_AT } from '@axe/domain/tabletop/ground/ground-over-ice';
import type {
  TableWorldLeaves,
  TableWorldSeaFloor,
  TableWorldWater,
  WaterPart,
} from '@axe/domain/tabletop/world/table-water';
import { lotusTileUrl } from '@axe/infrastructure/tabletop/water/lotus-texture';
import {
  attribute,
  float,
  fract,
  length,
  max,
  mix,
  positionWorld,
  smoothstep,
  sRGBTransferEOTF,
  texture,
  uniform,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import {
  BackSide,
  BufferGeometry,
  DataTexture,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  type Material,
  Mesh,
  MeshLambertNodeMaterial,
  type Node,
  RepeatWrapping,
  type Texture,
} from 'three/webgpu';

/**
 * Where the water comes in the order things are drawn: its floor after the board and the blocks and
 * before the grid, as the page lays it under the grid; its surface, sides and shore after everything
 * else, so what stands in the water is seen through it below the surface.
 */
const FLOOR_ORDER = 0.5;
const SURFACE_ORDER = 1000;
/**
 * Where ice comes: after the board, the grid and the board's layers laid over it, and before what the
 * page paints on the floor, as where a piece may move, and before the sprites, which stand on the ice
 * rather than in water to be seen through it.
 */
const ICE_ORDER = 1.75;
const LEAF_ORDER = 1000.5;
const SHORE_ORDER = 1001;

/** Draws a face laid over another in front of it, past the depth's rounding. */
const PULLED_FORWARD = { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 };

/** How many cells one repeat of the net of light spans on the floor, as the page draws it. */
const CAUSTIC_CELLS = 2.6;
/**
 * The same over the floor of a map under water, larger: the surface is far overhead, and over a
 * whole board a fine net reads as a pattern printed on it.
 */
const SEA_CAUSTIC_CELLS = 3.4;
/** How many cells one repeat of the glints spans on the surface. */
const GLINT_CELLS = 5.7;
/** How many cells one repeat of the scum and of the floating leaves spans, as the page draws them. */
const SCUM_CELLS = 2.1;
const LEAF_CELLS = 3.6;
/** How many cells one repeat of the clouds of silt spans, and of the streaks of a current, as the page drew them. */
const SILT_CELLS = 4.2;
const STREAK_CELLS = 3;
/** How many cells the frost on ice spreads over before it repeats, and how strongly it whitens the ice. */
const FROST_CELLS = 2.7;
const FROST_SHOWS = 0.45;
/** How many cells the cracks across ice run over before they repeat, and the colour they are drawn in, in sRGB. */
const ICE_CRACK_CELLS = 3.3;
const ICE_CRACK_COLOUR = [0.5, 0.6, 0.68] as const;
/** How many seconds the clouds of silt take to drift one repeat across and down, slower than the scum. */
const SILT_SECONDS = 180;
/** How many waves the clouds of silt are drawn from, and how fine the finest of them runs, as the page drew them. */
const SILT_WAVES = 16;
const SILT_FINEST = 3;
/** How many seconds the scum on still water takes to drift one repeat across and down, as the page's does. */
const SCUM_SECONDS = 120;
/** How many seconds a wave takes to run in to the shore. */
const WAVE_SECONDS = 4;
/**
 * How the two nets of light drift, as the page's do: the first moves one repeat down and across in
 * so many seconds, the second, larger and fainter, the other way across; the glints drift the second
 * way backwards, slower.
 */
const FIRST_NET_SECONDS = 26;
const SECOND_NET_SECONDS = 39;
const SECOND_NET_SCALE = 1.45;
const SECOND_NET_SHARE = 0.75;
const GLINT_SECONDS = 57;

type Taking = 'lit' | 'unlit';

/**
 * The water on the table: its surfaces coloured by the depths under them and glinting, its floors
 * darkened and crossed by a moving net of light, its sides where it stands over lower ground, and the
 * waves breaking on its shore. All of it is built from the triangles the table's water is made into,
 * and built again only when those change; it moves by itself while there is any and it may move.
 */
export class WaterLayer {
  readonly group = new Group();
  private readonly seconds = uniform(0);
  private readonly cellPx = uniform(50);
  /** How much of the net of light the floors wear: all of it from above, none for an eye among the pieces. */
  private readonly floorNet = uniform(1);
  /** Whether the eye stands among the pieces, which sees the sides of the water from outside alone. */
  private amongPieces = false;
  private sides: MeshLambertNodeMaterial | null = null;
  private netTile: Texture | null = null;
  private scumTiles: { readonly scum: Texture; readonly rim: Texture } | null = null;
  private currentTiles: { readonly silt: Texture; readonly streaks: Texture } | null = null;
  private iceCracks: Texture | null = null;
  /** The pictures of the floating leaves, by the picture, read once each and kept until the layer goes. */
  private readonly leafPictures = new Map<string, Texture>();
  private laid: TableWorldWater | null = null;
  private laidBoard = '';
  private meshes: Mesh[] = [];
  private changed = false;

  constructor(
    private readonly dress: (material: Material, taking: Taking) => void,
    private readonly picture: (url: string) => Texture
  ) {}

  /** How many parts of the water are drawn. */
  get shown(): number {
    return this.meshes.length;
  }

  /**
   * Lays the water out, the floor of a map under water over the board's shape, made anew when it is
   * asked for; builds it again only when the water or the board changed.
   */
  set(water: TableWorldWater, board: (() => BufferGeometry) | null, boardKey: string): void {
    if (water === this.laid && boardKey === this.laidBoard) return;
    this.laid = water;
    this.laidBoard = boardKey;
    this.clear();
    this.cellPx.value = water.cellPx;
    const { open, frozen } = surfacesOf(water);
    this.addSurface(open, SURFACE_ORDER);
    this.addSurface(frozen, ICE_ORDER);
    for (const floating of water.leaves) this.addLeaves(floating);
    this.add(water.floor, this.floorMaterial(CAUSTIC_CELLS), FLOOR_ORDER);
    if (water.seaFloor && board) this.addSeaFloor(water.seaFloor, board());
    this.add(water.sides, this.sideMaterial(), SURFACE_ORDER);
    this.add(water.shore, this.shoreMaterial(), SHORE_ORDER);
    this.changed = true;
  }

  /**
   * Has the water drawn for an eye standing among the pieces, as the page draws it for one: the floors
   * bare of the net of light, and each side seen from outside the water alone, so an eye under the
   * surface looks out past the sides round it.
   */
  lookFromAmongPieces(among: boolean): void {
    if (among === this.amongPieces) return;
    this.amongPieces = among;
    this.floorNet.value = among ? 0 : 1;
    if (this.sides) {
      this.sides.side = this.sideFacing();
      this.sides.needsUpdate = true;
    }
    this.changed = true;
  }

  /** Moves the water to where it is at a moment, in milliseconds; answers whether it moves by itself. */
  advance(timeMs: number): boolean {
    if (!this.laid?.moving || this.meshes.length === 0) return false;
    this.seconds.value = timeMs / 1000;
    this.changed = true;
    return true;
  }

  /** Whether anything was built or moved since this was last asked, which wants drawing. */
  takeChanged(): boolean {
    const changed = this.changed;
    this.changed = false;
    return changed;
  }

  dispose(): void {
    this.clear();
    this.netTile?.dispose();
    this.netTile = null;
    this.scumTiles?.scum.dispose();
    this.scumTiles?.rim.dispose();
    this.scumTiles = null;
    this.currentTiles?.silt.dispose();
    this.currentTiles?.streaks.dispose();
    this.currentTiles = null;
    for (const picture of this.leafPictures.values()) picture.dispose();
    this.leafPictures.clear();
  }

  /**
   * The net of light the page draws its water with, one tile of it to repeat, made once. It is read
   * between its pixels and from smaller copies of itself far off, as the page's picture of it is, so
   * its lines are drawn neither in squares close by nor broken up into dots far off.
   */
  private tile(): Texture {
    this.netTile ??= repeatingTile(causticAlpha(causticFieldOf(CAUSTIC_SEED)), CAUSTIC_TILE_PX);
    return this.netTile;
  }

  /** The scum the page floats on dirty water and the rim along its patches, a tile of each to repeat, made once. */
  private scumTile(): { readonly scum: Texture; readonly rim: Texture } {
    this.scumTiles ??= {
      scum: repeatingTile(scumTileAlpha(), WATER_PATTERN_TILE_PX),
      rim: repeatingTile(scumRimTileAlpha(), WATER_PATTERN_TILE_PX),
    };
    return this.scumTiles;
  }

  /** The cracks across a sheet of ice, a tile of them to repeat, made once. */
  private crackTile(): Texture {
    this.iceCracks ??= repeatingTile(iceCrackAlpha(CAUSTIC_SEED + 5), WATER_PATTERN_TILE_PX);
    return this.iceCracks;
  }

  /** The clouds of silt in murky water and the streaks of a current, a tile of each to repeat, made once. */
  private currentTile(): { readonly silt: Texture; readonly streaks: Texture } {
    this.currentTiles ??= {
      silt: repeatingTile(
        cloudAlpha(smoothFieldOf(CAUSTIC_SEED + 1, WATER_PATTERN_TILE_PX, SILT_WAVES, SILT_FINEST)),
        WATER_PATTERN_TILE_PX
      ),
      streaks: repeatingTile(streakAlpha(CAUSTIC_SEED + 3), WATER_PATTERN_TILE_PX),
    };
    return this.currentTiles;
  }

  /**
   * Lays the leaves floating over the cells that carry so much of them, in the page's own picture of
   * them, carried along with the water where it flows; none where the page cannot draw the picture.
   */
  private addLeaves(floating: TableWorldLeaves): void {
    const url = lotusTileUrl(floating.amount);
    if (!url) return;
    let picture = this.leafPictures.get(url);
    if (!picture) {
      picture = this.picture(url);
      picture.wrapS = RepeatWrapping;
      picture.wrapT = RepeatWrapping;
      this.leafPictures.set(url, picture);
    }
    const material = this.material(true);
    const flow = attribute('flow', 'vec2');
    const at = vec2(positionWorld.x, positionWorld.z)
      .div(this.cellPx.mul(LEAF_CELLS))
      .sub(flow.mul(this.seconds).div(LEAF_CELLS));
    material.colorNode = texture(picture, at);
    this.dress(material, 'lit');
    this.add(floating.part, material, LEAF_ORDER, (geometry) =>
      geometry.setAttribute('flow', new Float32BufferAttribute(floating.flow, 2))
    );
  }

  /**
   * How much of a point the net of light covers, from 0 to 1, as the page lays it: the net drifting
   * down and across, and a larger, fainter one drifting the other way across over it, each as bright
   * as the share given of it.
   */
  private nets(at: Node<'vec2'>, share: Node<'float'>): { first: Node<'float'>; second: Node<'float'> } {
    const tile = this.tile();
    const first = texture(tile, at.sub(vec2(this.seconds, this.seconds).div(FIRST_NET_SECONDS))).r.mul(share);
    const across = vec2(this.seconds.negate(), this.seconds).div(SECOND_NET_SECONDS);
    const second = texture(tile, at.div(SECOND_NET_SCALE).sub(across)).r.mul(share).mul(SECOND_NET_SHARE);
    return { first, second };
  }

  /** Lays a part of the surface of the water, with what each of its points carries. */
  private addSurface(surface: Surface, order: number): void {
    this.add(surface.part, this.surfaceMaterial(), order, (geometry) => {
      geometry.setAttribute('flow', new Float32BufferAttribute(surface.flow, 2));
      geometry.setAttribute('scum', new Float32BufferAttribute(everyOther(surface.scum, 0), 4));
      geometry.setAttribute('scumRim', new Float32BufferAttribute(everyOther(surface.scum, 4), 4));
      geometry.setAttribute('silt', new Float32BufferAttribute(surface.silt, 4));
      geometry.setAttribute(
        'extra',
        new Float32BufferAttribute(tripledWith(surface.part.extra, surface.streaks, surface.ice), 3)
      );
    });
  }

  private add(
    part: WaterPart,
    material: MeshLambertNodeMaterial,
    order: number,
    more?: (geometry: BufferGeometry) => void
  ): void {
    if (part.points.length === 0) {
      material.dispose();
      return;
    }
    const geometry = new BufferGeometry();
    const points = new Float32Array(part.points.length);
    for (let i = 0; i < part.points.length; i += 3) {
      points[i] = part.points[i];
      points[i + 1] = part.points[i + 2];
      points[i + 2] = part.points[i + 1];
    }
    geometry.setAttribute('position', new Float32BufferAttribute(points, 3));
    geometry.setAttribute('color', new Float32BufferAttribute(part.colours, 4));
    geometry.setAttribute('extra', new Float32BufferAttribute(part.extra, 1));
    more?.(geometry);
    geometry.computeVertexNormals();
    const mesh = new Mesh(geometry, material);
    mesh.renderOrder = order;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.meshes.push(mesh);
  }

  /** Lays the floor of a map under water over the board's shape, one colour all over. */
  private addSeaFloor(floor: TableWorldSeaFloor, geometry: BufferGeometry): void {
    const count = geometry.getAttribute('position').count;
    geometry.setAttribute(
      'color',
      new Float32BufferAttribute(
        new Float32Array(count * 4).map((_, i) => floor.colour[i % 4]),
        4
      )
    );
    geometry.setAttribute('extra', new Float32BufferAttribute(new Float32Array(count).fill(floor.net), 1));
    const mesh = new Mesh(geometry, this.floorMaterial(SEA_CAUSTIC_CELLS));
    mesh.renderOrder = FLOOR_ORDER;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.meshes.push(mesh);
  }

  private clear(): void {
    this.sides = null;
    for (const mesh of this.meshes) {
      this.group.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as Material).dispose();
    }
    this.meshes = [];
  }

  /** The colour a point is laid in, from sRGB, and how opaque. */
  private colour() {
    const colour = attribute('color', 'vec4');
    return { rgb: vec3(sRGBTransferEOTF(colour.rgb) as unknown as ReturnType<typeof vec3>), a: colour.a };
  }

  /** The surface: its colour, with the sky glinting on the ripples as they drift with the flow. */
  private surfaceMaterial(): MeshLambertNodeMaterial {
    const material = this.material(true);
    const { rgb, a } = this.colour();
    const flow = attribute('flow', 'vec2');
    const at = vec2(positionWorld.x, positionWorld.z)
      .div(this.cellPx.mul(GLINT_CELLS))
      .sub(flow.mul(this.seconds).div(GLINT_CELLS));
    const drift = vec2(this.seconds.negate(), this.seconds).div(GLINT_SECONDS);
    const extra = attribute('extra', 'vec3');
    const glint = texture(this.tile(), at.add(drift)).r.mul(extra.x);
    const glinted = { colour: mix(rgb, vec3(1, 1, 1), glint), alpha: max(a, glint) };
    const scumAt = vec2(positionWorld.x, positionWorld.z)
      .div(this.cellPx.mul(SCUM_CELLS))
      .sub(flow.mul(this.seconds).div(SCUM_CELLS))
      .sub(vec2(this.seconds.negate(), this.seconds).div(SCUM_SECONDS));
    const currents = this.currentTile();
    const silt = attribute('silt', 'vec4');
    const siltAt = vec2(positionWorld.x, positionWorld.z)
      .div(this.cellPx.mul(SILT_CELLS))
      .sub(flow.mul(this.seconds).div(SILT_CELLS))
      .add(vec2(this.seconds, this.seconds.negate()).div(SILT_SECONDS));
    const silted = laidOver(glinted, linearOf(silt.rgb), texture(currents.silt, siltAt).r.mul(silt.a));
    const tiles = this.scumTile();
    const scum = attribute('scum', 'vec4');
    const rim = attribute('scumRim', 'vec4');
    const scummed = laidOver(silted, linearOf(scum.rgb), texture(tiles.scum, scumAt).r.mul(scum.a));
    const rimmed = laidOver(scummed, linearOf(rim.rgb), texture(tiles.rim, scumAt).r.mul(rim.a));
    const speed = length(flow);
    const along = flow.div(max(speed, 0.0001));
    const ground = vec2(positionWorld.x, positionWorld.z).div(this.cellPx);
    const streakAt = vec2(
      ground.dot(along).sub(speed.mul(this.seconds)),
      ground.dot(vec2(along.y.negate(), along.x))
    ).div(STREAK_CELLS);
    const streaked = laidOver(rimmed, vec3(1, 1, 1), texture(currents.streaks, streakAt).r.mul(extra.y));
    const ice = extra.z;
    const frostAt = ground.div(FROST_CELLS);
    const frosted = laidOver(streaked, vec3(1, 1, 1), texture(tiles.scum, frostAt).r.mul(ice).mul(FROST_SHOWS));
    const cracked = laidOver(
      frosted,
      linearOf(vec3(...ICE_CRACK_COLOUR)),
      texture(this.crackTile(), ground.div(ICE_CRACK_CELLS)).r.mul(ice)
    );
    material.colorNode = vec4(cracked.colour, cracked.alpha);
    this.dress(material, 'lit');
    return material;
  }

  /** The floor: the colour of the depths, crossed by the net of light the surface throws down. */
  private floorMaterial(netCells: number): MeshLambertNodeMaterial {
    const material = this.material(false);
    Object.assign(material, PULLED_FORWARD);
    const { rgb, a } = this.colour();
    const at = vec2(positionWorld.x, positionWorld.z).div(this.cellPx.mul(netCells));
    const { first, second } = this.nets(at, attribute('extra', 'float').mul(this.floorNet));
    const clear = float(1).sub(first).mul(float(1).sub(second));
    const alpha = float(1).sub(float(1).sub(a).mul(clear));
    const colour = rgb.mul(a).mul(clear).add(float(1).sub(clear)).div(max(alpha, 0.0001));
    material.colorNode = vec4(colour, alpha);
    this.dress(material, 'lit');
    return material;
  }

  private sideMaterial(): MeshLambertNodeMaterial {
    const material = this.material(true);
    material.side = this.sideFacing();
    const { rgb, a } = this.colour();
    material.colorNode = vec4(rgb, a);
    this.dress(material, 'lit');
    this.sides = material;
    return material;
  }

  /**
   * Which faces of a side are drawn: both from above, and from among the pieces only the one turned
   * out of the water, a side's front being the one turned into the cell it goes round.
   */
  private sideFacing(): typeof DoubleSide | typeof BackSide {
    return this.amongPieces ? BackSide : DoubleSide;
  }

  /** The shore: foam at the land, and waves running in to it from the open water and dying on it. */
  private shoreMaterial(): MeshLambertNodeMaterial {
    const material = this.material(true);
    const away = attribute('extra', 'float');
    const wave = fract(away.add(this.seconds.div(WAVE_SECONDS)));
    const crest = smoothstep(0.75, 0.95, wave).mul(float(1).sub(smoothstep(0.95, 1, wave)));
    const foam = float(1)
      .sub(smoothstep(0, 0.35, away))
      .mul(0.55);
    const shown = max(foam, crest.mul(float(1).sub(away)).mul(0.6));
    material.colorNode = vec4(vec3(1, 1, 1), shown);
    this.dress(material, 'lit');
    return material;
  }

  private material(pulled: boolean): MeshLambertNodeMaterial {
    return new MeshLambertNodeMaterial({
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      ...(pulled ? PULLED_FORWARD : {}),
    });
  }
}

/** A tile of white as opaque as the alpha given, to repeat, read between its pixels and from smaller copies of itself far off. */
function repeatingTile(alpha: Uint8ClampedArray, size: number): Texture {
  const data = new Uint8Array(alpha.length * 4);
  for (let i = 0; i < alpha.length; i++) data.fill(alpha[i], i * 4, i * 4 + 4);
  const tile = new DataTexture(data, size, size);
  tile.wrapS = RepeatWrapping;
  tile.wrapT = RepeatWrapping;
  tile.magFilter = LinearFilter;
  tile.minFilter = LinearMipmapLinearFilter;
  tile.generateMipmaps = true;
  tile.needsUpdate = true;
  return tile;
}

/** Four figures of every eight, from the one given, as one attribute of a point carries them. */
/**
 * Three figures to a point, the first from each list: the surface carries how strongly it glints, how
 * strongly a current streaks it and how much of it is frozen in one attribute, as a graphics card
 * draws from eight at most.
 */
function tripledWith(first: Float32Array, second: Float32Array, third: Float32Array): Float32Array {
  const tripled = new Float32Array(first.length * 3);
  for (let i = 0; i < first.length; i++) {
    tripled[i * 3] = first[i];
    tripled[i * 3 + 1] = second[i] ?? 0;
    tripled[i * 3 + 2] = third[i] ?? 0;
  }
  return tripled;
}

/** A part of the surface of the water and what each of its points carries, as the scene's water holds them. */
interface Surface {
  readonly part: WaterPart;
  readonly flow: Float32Array;
  readonly scum: Float32Array;
  readonly silt: Float32Array;
  readonly streaks: Float32Array;
  readonly ice: Float32Array;
}

/**
 * The surface of the water parted into the open water and the ice hard enough to stand on, a
 * triangle at a time, as the cell it belongs to is frozen; each is drawn in its own place in the order.
 */
function surfacesOf(water: TableWorldWater): { open: Surface; frozen: Surface } {
  const sizes = { points: 3, colours: 4, extra: 1, flow: 2, scum: 8, silt: 4, streaks: 1, ice: 1 } as const;
  const kept = (frozen: boolean) => {
    const picked: number[] = [];
    for (let first = 0; first < water.ice.length; first += 3) {
      if (water.ice[first] >= ICE_BEARS_AT === frozen) picked.push(first, first + 1, first + 2);
    }
    const of = (values: Float32Array, size: number) => {
      const out = new Float32Array(picked.length * size);
      picked.forEach((point, at) => out.set(values.subarray(point * size, point * size + size), at * size));
      return out;
    };
    return {
      part: {
        points: of(water.surface.points, sizes.points),
        colours: of(water.surface.colours, sizes.colours),
        extra: of(water.surface.extra, sizes.extra),
      },
      flow: of(water.flow, sizes.flow),
      scum: of(water.scum, sizes.scum),
      silt: of(water.silt, sizes.silt),
      streaks: of(water.streaks, sizes.streaks),
      ice: of(water.ice, sizes.ice),
    };
  };
  if (!water.ice.some((ice) => ice >= ICE_BEARS_AT)) {
    const { surface, flow, scum, silt, streaks, ice } = water;
    return { open: { part: surface, flow, scum, silt, streaks, ice }, frozen: kept(true) };
  }
  return { open: kept(false), frozen: kept(true) };
}

function everyOther(values: Float32Array, from: number): Float32Array {
  const picked = new Float32Array(values.length / 2);
  for (let i = 0, j = 0; i < values.length; i += 8, j += 4) picked.set(values.subarray(i + from, i + from + 4), j);
  return picked;
}

/** A colour from sRGB into the light the scene is lit in. */
function linearOf(colour: Node<'vec3'>): Node<'vec3'> {
  return sRGBTransferEOTF(colour) as unknown as Node<'vec3'>;
}

/** A colour laid over another as opaque as it is, as the page lays one picture over another. */
function laidOver(
  under: { readonly colour: Node<'vec3'>; readonly alpha: Node<'float'> },
  colour: Node<'vec3'>,
  alpha: Node<'float'>
): { colour: Node<'vec3'>; alpha: Node<'float'> } {
  const laid = alpha.add(under.alpha.mul(float(1).sub(alpha)));
  return {
    colour: colour
      .mul(alpha)
      .add(under.colour.mul(under.alpha).mul(float(1).sub(alpha)))
      .div(max(laid, 0.0001)),
    alpha: laid,
  };
}
