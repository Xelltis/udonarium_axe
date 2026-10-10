import {
  BackSide,
  BoxGeometry,
  Color,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  Scene,
  SphereGeometry,
} from 'three';

/** A softbox: where it stands about the tray, how large it is and how bright. */
interface Softbox {
  /** Its bearing about the tray, anticlockwise from the right, and its height above the floor, in degrees. */
  readonly bearing: number;
  readonly elevation: number;
  readonly width: number;
  readonly height: number;
  readonly brightness: number;
}

/**
 * The lights the dice reflect, as a photographer sets them about a small glossy subject: a large
 * box at the left and a smaller one at the right, low enough that the dice show them along their
 * sides and rounded edges, and a strip low behind them that rims their far edges.
 *
 * Nothing bright stands high in front of or behind the dice, where their top faces would mirror it
 * toward a camera looking down on them, so the face that shows the roll keeps its colour and its
 * number reads clearly.
 */
const SOFTBOXES: readonly Softbox[] = [
  { bearing: 160, elevation: 25, width: 14, height: 8, brightness: 7 },
  { bearing: 20, elevation: 24, width: 8, height: 6, brightness: 2.6 },
  { bearing: 90, elevation: 10, width: 26, height: 2.4, brightness: 3.4 },
];

/**
 * A broad, soft panel high above the dice, for metal alone. A metal die shows nothing but what it
 * mirrors, and its top face mirrors what is above it; its marks are paint, which stands out the more
 * brightly the metal round it shines.
 */
const OVERHEAD: Softbox = { bearing: 100, elevation: 72, width: 30, height: 22, brightness: 1.1 };

const DISTANCE = 20;

/**
 * A studio to light the dice by, for the environment map: a dim room, darker underfoot, and the
 * softboxes in it, with a panel overhead for metal. The floor of the tray is the plane z = 0, and the
 * viewer stands toward −y.
 */
export function diceStudio(forMetal = false): Scene {
  const scene = new Scene();
  const room = new SphereGeometry(DISTANCE * 1.6, 32, 16);
  room.rotateX(Math.PI / 2);
  const shades: number[] = [];
  const position = room.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    const up = position.getZ(i) / (DISTANCE * 1.6);
    const shade = up < 0 ? 0.04 : 0.1 + 0.12 * (1 - up);
    shades.push(shade, shade, shade * 1.04);
  }
  room.setAttribute('color', new Float32BufferAttribute(shades, 3));
  scene.add(new Mesh(room, new MeshBasicMaterial({ side: BackSide, vertexColors: true })));

  const panel = new BoxGeometry(1, 1, 1);
  for (const box of forMetal ? [...SOFTBOXES, OVERHEAD] : SOFTBOXES) {
    const bearing = (box.bearing * Math.PI) / 180;
    const elevation = (box.elevation * Math.PI) / 180;
    const light = new Mesh(panel, new MeshBasicMaterial({ color: new Color().setScalar(box.brightness) }));
    light.position.set(
      Math.cos(bearing) * Math.cos(elevation) * DISTANCE,
      Math.sin(bearing) * Math.cos(elevation) * DISTANCE,
      Math.sin(elevation) * DISTANCE
    );
    light.up.set(0, 0, 1);
    light.lookAt(0, 0, 0);
    light.scale.set(box.width, box.height, 0.1);
    scene.add(light);
  }
  return scene;
}
