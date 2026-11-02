import type { TableWorldCoin, TableWorldCoinSide } from '@axe/domain/tabletop/world/table-coins';
import { pointOnFace, turnedAbout, turnedOnFace } from '@axe/domain/tabletop/world/table-sprites';
import { paintCoinSide } from '@axe/infrastructure/table-3d/coin-sides';
import {
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Matrix4,
  Mesh,
  MeshBasicNodeMaterial,
  SRGBColorSpace,
  Vector3,
} from 'three/webgpu';

/** How many pixels across a side of a coin is painted at. */
const SIDE_PX = 256;
/** How many flat pieces a coin's round edges are made of, as the page builds its rim of them. */
const ROUND_SEGMENTS = 48;
const RIM_SEGMENTS = 24;

/** A direction of the board's space as the scene's, whose axes run east, up and south. */
function sceneDirection(v: { x: number; y: number; z: number }): Vector3 {
  return new Vector3(v.x, v.z, v.y);
}

/** A side of a coin, painted once for every coin of that size showing it. */
interface PaintedSide {
  readonly texture: CanvasTexture;
  readonly material: MeshBasicNodeMaterial;
  users: number;
}

interface DrawnCoin {
  readonly shape: string;
  readonly body: Group;
  readonly sides: readonly string[];
}

/**
 * The coins on the table, each a disc of the scene: its side turned out on top, the side against
 * the face beneath, and its rim between them, shaded round as the page shades it.
 */
export class CoinLayer {
  readonly group = new Group();
  private readonly drawn = new Map<string, DrawnCoin>();
  private readonly sides = new Map<string, PaintedSide>();
  private readonly rim = new MeshBasicNodeMaterial({ vertexColors: true, side: DoubleSide });

  constructor(
    private readonly needsFrame: () => void,
    private readonly dress: (material: MeshBasicNodeMaterial) => void = () => undefined
  ) {
    this.dress(this.rim);
  }

  /** Lays out the coins the scene holds now, building again only the ones whose shape or sides changed. */
  set(coins: readonly TableWorldCoin[]): void {
    const wanted = new Set<string>();
    for (const coin of coins) {
      wanted.add(coin.id);
      const sides = [sideKey(coin.outer, coin.radiusPx), sideKey(coin.inner, coin.radiusPx)];
      const shape = JSON.stringify([coin.radiusPx, coin.thicknessPx, coin.backUp, sides]);
      let drawn = this.drawn.get(coin.id);
      if (drawn && drawn.shape !== shape) {
        this.forget(coin.id, drawn);
        drawn = undefined;
      }
      if (!drawn) {
        drawn = { shape, body: this.build(coin), sides };
        this.drawn.set(coin.id, drawn);
        this.group.add(drawn.body);
      }
      place(drawn.body, coin);
    }
    for (const [id, drawn] of this.drawn) if (!wanted.has(id)) this.forget(id, drawn);
  }

  dispose(): void {
    for (const [id, drawn] of this.drawn) this.forget(id, drawn);
    this.rim.dispose();
  }

  private build(coin: TableWorldCoin): Group {
    const body = new Group();
    const radius = coin.radiusPx;
    const half = coin.thicknessPx / 2;
    const top = new CircleGeometry(radius, ROUND_SEGMENTS).rotateX(-Math.PI / 2).translate(0, half, 0);
    const bottom = new CircleGeometry(radius, ROUND_SEGMENTS)
      .rotateY(Math.PI)
      .rotateX(-Math.PI / 2)
      .translate(0, -half, 0);
    body.add(new Mesh(top, this.side(coin.outer, radius)));
    body.add(new Mesh(bottom, this.side(coin.inner, radius)));
    body.add(new Mesh(rimGeometry(radius, coin.thicknessPx, coin.backUp), this.rim));
    return body;
  }

  /** The material a side of a coin is drawn with, painted again once its picture has come. */
  private side(look: TableWorldCoinSide, radius: number): MeshBasicNodeMaterial {
    const key = sideKey(look, radius);
    let painted = this.sides.get(key);
    if (!painted) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = SIDE_PX;
      paintCoinSide(canvas, look.side, radius * 2, null);
      const texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;
      const material = new MeshBasicNodeMaterial({ map: texture, transparent: true, alphaTest: 0.01 });
      this.dress(material);
      painted = { texture, material, users: 0 };
      this.sides.set(key, painted);
      if (look.pictureUrl) this.paintPicture(look, radius, canvas, texture);
    }
    painted.users++;
    return painted.material;
  }

  private paintPicture(look: TableWorldCoinSide, radius: number, canvas: HTMLCanvasElement, texture: CanvasTexture) {
    const picture = new Image();
    picture.onload = () => {
      paintCoinSide(canvas, look.side, radius * 2, picture);
      texture.needsUpdate = true;
      this.needsFrame();
    };
    picture.src = look.pictureUrl;
  }

  private forget(id: string, drawn: DrawnCoin): void {
    this.group.remove(drawn.body);
    drawn.body.traverse((object) => (object as Mesh).geometry?.dispose());
    this.drawn.delete(id);
    for (const key of drawn.sides) {
      const painted = this.sides.get(key);
      if (!painted || --painted.users > 0) continue;
      painted.texture.dispose();
      painted.material.dispose();
      this.sides.delete(key);
    }
  }
}

function sideKey(look: TableWorldCoinSide, radius: number): string {
  return `${look.side}|${look.pictureUrl}|${radius}`;
}

/**
 * Stands a coin's body where the coin lies: its middle half its thickness off its underside, its
 * axis out of the face, and turned in the face as the coin is; and where a move has it, as it flips.
 */
function place(body: Group, coin: TableWorldCoin): void {
  const axes = turnedOnFace(coin.face, coin.rotateDeg);
  const flip = coin.motion?.flipDeg ?? 0;
  const x = sceneDirection(turnedAbout(axes.across, axes.down, flip)).normalize();
  const y = sceneDirection(turnedAbout(coin.face.normal, axes.down, flip)).normalize();
  const z = new Vector3().crossVectors(x, y).normalize();
  const lift = coin.motion?.out ?? 0;
  body.position.copy(sceneDirection(pointOnFace(coin.face, coin.x, coin.y, coin.base + coin.thicknessPx / 2 + lift)));
  body.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(x, y, z));
  body.scale.setScalar(coin.motion?.scale ?? 1);
}

/**
 * A coin's rim, each part of it as bright as the page shades it: brightest towards the coin's own
 * upper right, which turns over with the coin.
 */
function rimGeometry(radius: number, thickness: number, backUp: boolean): BufferGeometry {
  const rim = new CylinderGeometry(radius, radius, thickness, RIM_SEGMENTS, 1, true);
  const positions = rim.getAttribute('position');
  const colours: number[] = [];
  const colour = new Color();
  for (let i = 0; i < positions.count; i++) {
    const across = positions.getX(i);
    const down = positions.getZ(i);
    const angle = Math.atan2(backUp ? -across : across, -down);
    const lit = 0.5 + 0.5 * Math.cos(angle - Math.PI / 4);
    colour.setHSL(41 / 360, 0.58, (26 + 32 * lit) / 100, SRGBColorSpace);
    colours.push(colour.r, colour.g, colour.b);
  }
  rim.setAttribute('color', new Float32BufferAttribute(colours, 3));
  return rim;
}
