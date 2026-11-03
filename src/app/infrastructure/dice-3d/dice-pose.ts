import {
  type DiceThrowResult,
  FRAME_STRIDE,
  FRAMES_PER_SECOND,
} from '@axe/infrastructure/dice-3d/dice-physics-message';
import { ACCENT_SECONDS } from '@axe/infrastructure/dice-3d/dice-physics-message';
import { type BufferGeometry, CanvasTexture, type Group, type Material, type Mesh, Quaternion } from 'three';

/**
 * How dark the patch under a die is where it touches the floor, how wide beside the die, and how
 * high the die rises before the patch is gone: the light's shadow alone leaves a die looking stuck
 * on rather than standing on a busy table.
 */
export const CONTACT_OPACITY = 0.55;
export const CONTACT_SPREAD = 2.3;
export const CONTACT_FADE_HEIGHT = 3;
/** How far above the floor the patch lies, so it is drawn over the floor and not into it. */
export const CONTACT_LIFT = 0.02;
/**
 * The ring of light a critical or a fumble flashes under each die as it comes to rest: its colour,
 * and how wide beside the die.
 */
export const ACCENT_COLORS = { critical: 0xffc53d, fumble: 0xff3344 } as const;
export const HALO_SPREAD = 3.4;

/**
 * What of a throw set up to be drawn moves as its recording plays, whatever draws it: each die's
 * body, the patch under it and the ring a critical or a fumble flashes, with how far each die
 * reaches and how high it stands at rest.
 */
export interface PosedThrow {
  readonly bodies: readonly Group[];
  readonly contacts: readonly Mesh<BufferGeometry, Material>[];
  readonly halos: readonly Mesh<BufferGeometry, Material>[];
  readonly radii: readonly number[];
  readonly restHeights: readonly number[];
  readonly result: DiceThrowResult;
  /** How long the dice take to stop, in seconds. */
  readonly restSeconds: number;
}

/** Sets every die where the recording has it some seconds in, between the two frames about that moment. */
export function poseThrow(posed: PosedThrow, seconds: number, opacity = 1): void {
  const { result, bodies } = posed;
  const count = bodies.length;
  const at = Math.min(Math.max(seconds * FRAMES_PER_SECOND, 0), result.frameCount - 1);
  const before = Math.floor(at);
  const after = Math.min(before + 1, result.frameCount - 1);
  const t = at - before;
  const q0 = new Quaternion();
  const q1 = new Quaternion();
  bodies.forEach((body, index) => {
    const a = (before * count + index) * FRAME_STRIDE;
    const b = (after * count + index) * FRAME_STRIDE;
    const f = result.frames;
    body.position.set(
      f[a] + (f[b] - f[a]) * t,
      f[a + 1] + (f[b + 1] - f[a + 1]) * t,
      f[a + 2] + (f[b + 2] - f[a + 2]) * t
    );
    q0.set(f[a + 3], f[a + 4], f[a + 5], f[a + 6]);
    q1.set(f[b + 3], f[b + 4], f[b + 5], f[b + 6]);
    body.quaternion.slerpQuaternions(q0, q1, t);

    // The patch under the die spreads and fades as the die leaves the floor.
    const lift = Math.max(0, body.position.z - posed.restHeights[index]);
    const contact = posed.contacts[index];
    contact.position.set(body.position.x, body.position.y, CONTACT_LIFT);
    contact.scale.setScalar(posed.radii[index] * CONTACT_SPREAD * (1 + lift * 0.12));
    contact.material.opacity = CONTACT_OPACITY * Math.max(0, 1 - lift / CONTACT_FADE_HEIGHT) * opacity;

    // A critical or a fumble swells a ring of light under the die as it stops, and lets it go.
    const halo = posed.halos[index];
    if (halo) {
      const since = (seconds - posed.restSeconds) / ACCENT_SECONDS;
      const swell = since > 0 && since < 1 ? Math.sin(Math.PI * since) : 0;
      halo.position.set(body.position.x, body.position.y, CONTACT_LIFT * 2);
      halo.scale.setScalar(posed.radii[index] * HALO_SPREAD * (0.85 + 0.25 * since));
      halo.material.opacity = swell * opacity;
    }
  });
}

/** A ring, bright a little in from its edge and fading softly to nothing inside and out. */
export function haloTexture(): CanvasTexture {
  return radialTexture([
    [0, 0],
    [0.42, 0.08],
    [0.72, 1],
    [1, 0],
  ]);
}

/** A round patch, darkest in the middle and fading out softly to nothing at its edge. */
export function contactTexture(): CanvasTexture {
  return radialTexture([
    [0, 1],
    [0.35, 0.62],
    [0.7, 0.16],
    [1, 0],
  ]);
}

function radialTexture(stops: readonly (readonly [number, number])[]): CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [at, alpha] of stops) gradient.addColorStop(at, `rgba(255,255,255,${alpha})`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new CanvasTexture(canvas);
}
