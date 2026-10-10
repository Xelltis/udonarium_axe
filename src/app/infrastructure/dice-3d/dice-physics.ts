import { seededRandom } from '@axe/core/util/seeded-random';
import { upFace } from '@axe/domain/dice/dice-3d/die-symmetry';
import { dieRadiusOf, DieShape, polyhedronOf } from '@axe/domain/dice/dice-3d/polyhedra';
import { Quat, Vec3 as Point } from '@axe/domain/dice/dice-3d/rotation';
import { throwSeedOf } from '@axe/domain/dice/dice-3d/throw-seed';
import { RestingDie, ThrowFault, throwFaultOf, Tray } from '@axe/domain/dice/dice-3d/throw-validation';
import {
  DiceThrowRequest,
  DiceThrowResult,
  FRAME_STRIDE,
  FRAMES_PER_SECOND,
  ThrowEdge,
} from '@axe/infrastructure/dice-3d/dice-physics-message';
import { faceTheReader } from '@axe/infrastructure/dice-3d/reader-facing';
import {
  Body,
  ContactMaterial,
  ConvexPolyhedron,
  Material,
  NaiveBroadphase,
  Plane,
  Quaternion,
  SAPBroadphase,
  Vec3,
  World,
} from 'cannon-es';

/**
 * Gravity in the dice world, where a die covers a patch of floor a little under two units across.
 *
 * Taken at the scale of a large, weighty die, about 30 mm along an edge, so the dice fly, bounce and
 * tumble at a pace the eye can follow and settle in one to two seconds, rather than skittering to a
 * stop as small dice do.
 */
const GRAVITY = 300;
/** The most steps a frame is cut into, which the dice need while they fly in and first land. */
const MOST_SUBSTEPS = 4;
/**
 * The farthest any point of a die may move in one step: about as deep as a die sinks into the
 * floor or another die in the step it lands, which is too little to see.
 */
const STEP_REACH = 0.25;
/** The longest a throw is given to come to rest, about five and a half seconds. */
const MAX_FRAMES = 330;
/** How long the dice must stay still to count as settled, and how much of the stillness is kept. */
const STILL_FRAMES = 15;
const TAIL_FRAMES = 12;
const STILL_SPEED = 0.2;
const STILL_SPIN = 0.35;
const LINEAR_DAMPING = 0.03;
const ANGULAR_DAMPING = 0.04;
/**
 * When dice still moving begin to tire, and how fast: a crowd of round dice nudge each other on and
 * on, so past two seconds each frame takes a little more out of them until they lie still.
 */
const TIRE_FROM_FRAME = 120;
const TIRE_PER_FRAME = 0.006;
/** The most dice a throw is thrown again for when it leaves a number upside down. */
const REREAD_UPRIGHT_UP_TO = 4;
/** How many dice make a heap, whose dice may come to rest leaning on one another. */
const HEAPED_FROM = 8;
/** The most dice whose every pair is tried for a collision; more are swept for them. */
const NAIVE_PAIRS_UP_TO = 12;
/** How many times a spoiled throw is thrown again before the least spoiled is kept. */
export const MAX_ATTEMPTS = 8;

const FAULT_ORDER: readonly (ThrowFault | null)[] = [null, 'cocked', 'stacked', 'unsettled', 'outside'];

/**
 * Works out a throw of the dice onto the tray: how each die moves frame by frame, which face it
 * comes to rest on, and the turn inside it that shows its target instead.
 *
 * The throw is seeded from what every peer shares about the roll, so all of them work out the same
 * throw. A throw whose dice do not settle, leave the tray, rest on one another or lean is thrown
 * again with the next seed, and so, last of all, is one that leaves a number upside down to the
 * viewer; when every attempt is spoiled, the least spoiled is kept.
 */
export function simulateThrow(request: DiceThrowRequest): DiceThrowResult {
  let kept: { result: DiceThrowResult; rank: number } | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const thrown = throwOnce(request, attempt);
    const faced = faceTheReader(request.shapes, thrown.landed, request.targets, thrown, request.tray, request.away);
    const result = { ...thrown, frames: faced.frames, corrections: faced.corrections };
    // Every die left upside down counts for less than any fault, so a clean throw that reads badly
    // still beats a spoiled one.
    const rank = spoilOf(thrown.fault, faced.askew, request.shapes.length);
    if (rank === 0) return result;
    if (!kept || rank < kept.rank) kept = { result, rank };
  }
  return kept!.result;
}

/**
 * How spoiled a throw is: 0 for one to keep at once, more for worse. Every fault is worse than any
 * number left upside down, which counts only in a roll of a few dice, where it is the one the eye
 * goes to; in a large roll one or two always are, and none of them stands out. A large roll's dice
 * leaning on one another, as a heap of real dice does, is no fault either: only dice that leave the
 * tray or never come to rest send it to be thrown again.
 */
export function spoilOf(fault: ThrowFault | null, askew: number, dice: number): number {
  if (fault !== null && !(dice > HEAPED_FROM && (fault === 'cocked' || fault === 'stacked'))) {
    return FAULT_ORDER.indexOf(fault);
  }
  return dice <= REREAD_UPRIGHT_UP_TO ? askew / (dice + 1) : 0;
}

function throwOnce(request: DiceThrowRequest, attempt: number): Omit<DiceThrowResult, 'corrections'> {
  const random = seededRandom(throwSeedOf(request.key, attempt));
  const { world, diceMaterial, walls } = buildWorld(request.tray, request.shapes.length);
  const bodies = request.shapes.map((shape) => addDie(world, shape, diceMaterial));
  launch(bodies, request.shapes, request.tray, request.edge, random);
  // The dice fly in over the edge they are thrown from, which closes behind them once they are all in.
  const doorway = walls[request.edge];
  doorway.collisionResponse = false;

  const count = bodies.length;
  const frames = new Float32Array(MAX_FRAMES * count * FRAME_STRIDE);
  let recorded = 0;
  let stillFor = 0;
  let settledAt = -1;

  for (let frame = 0; frame < MAX_FRAMES; frame++) {
    if (frame >= TIRE_FROM_FRAME) tire(bodies, frame);
    const substeps = substepsFor(bodies, request.shapes);
    for (let substep = 0; substep < substeps; substep++) {
      world.step(1 / (FRAMES_PER_SECOND * substeps));
      if (
        !doorway.collisionResponse &&
        bodies.every((body, index) => isInside(body, request.shapes[index], request.tray))
      ) {
        doorway.collisionResponse = true;
      }
    }
    bodies.forEach((body, index) => {
      const at = (frame * count + index) * FRAME_STRIDE;
      frames[at] = body.position.x;
      frames[at + 1] = body.position.y;
      frames[at + 2] = body.position.z;
      frames[at + 3] = body.quaternion.x;
      frames[at + 4] = body.quaternion.y;
      frames[at + 5] = body.quaternion.z;
      frames[at + 6] = body.quaternion.w;
    });
    recorded = frame + 1;
    const still = bodies.every(
      (body) =>
        body.sleepState === Body.SLEEPING ||
        (body.velocity.length() < STILL_SPEED && body.angularVelocity.length() < STILL_SPIN)
    );
    stillFor = still ? stillFor + 1 : 0;
    if (settledAt < 0 && stillFor >= STILL_FRAMES) settledAt = frame;
    if (settledAt >= 0 && frame >= settledAt + TAIL_FRAMES) break;
  }

  const resting: RestingDie[] = bodies.map((body, index) => ({
    shape: request.shapes[index],
    position: [body.position.x, body.position.y, body.position.z] as Point,
    rotation: [body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w] as Quat,
  }));
  const fault = throwFaultOf(resting, request.tray, settledAt >= 0);
  return {
    frameCount: recorded,
    restFrame: settledAt >= 0 ? settledAt - STILL_FRAMES + 1 : recorded - 1,
    frames: frames.slice(0, recorded * count * FRAME_STRIDE),
    landed: resting.map((die) => upFace(polyhedronOf(die.shape), die.rotation)),
    attempt,
    fault,
  };
}

/**
 * How many steps the next frame is cut into: as many as keep the fastest point of a die within a
 * step's reach, so the dice flying in and landing are worked out finely, and the long rolling and
 * rocking to rest that follows takes a step a frame.
 */
function substepsFor(bodies: readonly Body[], shapes: readonly DieShape[]): number {
  let fastest = 0;
  bodies.forEach((body, index) => {
    if (body.sleepState === Body.SLEEPING) return;
    fastest = Math.max(fastest, body.velocity.length() + body.angularVelocity.length() * dieRadiusOf(shapes[index]));
  });
  return Math.min(MOST_SUBSTEPS, Math.max(1, Math.ceil(fastest / (FRAMES_PER_SECOND * STEP_REACH))));
}

/** Takes more out of every die's motion the longer the throw goes on. */
function tire(bodies: readonly Body[], frame: number): void {
  const extra = (frame - TIRE_FROM_FRAME) * TIRE_PER_FRAME;
  for (const body of bodies) {
    body.linearDamping = Math.min(0.95, LINEAR_DAMPING + extra);
    body.angularDamping = Math.min(0.95, ANGULAR_DAMPING + extra);
  }
}

function buildWorld(
  tray: Tray,
  dice: number
): { world: World; diceMaterial: Material; walls: Record<ThrowEdge | 'far', Body> } {
  const world = new World({ gravity: new Vec3(0, 0, -GRAVITY), allowSleep: true });
  // Trying every pair is quickest for a few dice; sweeping along an axis wins once there are many.
  world.broadphase = dice <= NAIVE_PAIRS_UP_TO ? new NaiveBroadphase() : new SAPBroadphase(world);
  // Pairs are tried by their boxes rather than their spheres, so that the walls' boxes count.
  world.broadphase.useBoundingBoxes = true;
  (world.solver as unknown as { iterations: number }).iterations = 16;

  const floorMaterial = new Material('floor');
  const wallMaterial = new Material('wall');
  const diceMaterial = new Material('dice');
  world.addContactMaterial(new ContactMaterial(diceMaterial, floorMaterial, { friction: 0.2, restitution: 0.45 }));
  world.addContactMaterial(new ContactMaterial(diceMaterial, wallMaterial, { friction: 0.12, restitution: 0.55 }));
  world.addContactMaterial(new ContactMaterial(diceMaterial, diceMaterial, { friction: 0.2, restitution: 0.5 }));

  world.addBody(new Body({ mass: 0, material: floorMaterial, shape: new Plane() }));
  // Each wall is a half-space facing into the tray, so a die moving however fast never ends up
  // behind one.
  const wallAt = (x: number, y: number, rx: number, ry: number): Body => {
    const wall = new Body({ mass: 0, material: wallMaterial, shape: new Plane() });
    wall.position.set(x, y, 0);
    wall.quaternion.setFromEuler(rx, ry, 0);
    world.addBody(wall);
    boundBehind(wall);
    return wall;
  };
  const walls = {
    right: wallAt(tray.halfWidth, 0, 0, -Math.PI / 2),
    left: wallAt(-tray.halfWidth, 0, 0, Math.PI / 2),
    far: wallAt(0, tray.halfDepth, Math.PI / 2, 0),
    near: wallAt(0, -tray.halfDepth, -Math.PI / 2, 0),
  };
  return { world, diceMaterial, walls };
}

/**
 * Bounds a wall by the space behind it, so a die is tried against the wall only once it reaches it.
 * A plane stood upright is otherwise taken to reach everywhere, and every die would be tried
 * against every wall on every step. A wall stands across the x or y axis from the middle of the
 * tray, on the side its position lies.
 */
function boundBehind(wall: Body): void {
  const far = Number.MAX_VALUE;
  const { x, y } = wall.position;
  wall.aabb.lowerBound.set(x > 0 ? x : -far, y > 0 ? y : -far, -far);
  wall.aabb.upperBound.set(x < 0 ? x : far, y < 0 ? y : far, far);
  wall.aabbNeedsUpdate = false;
}

/** Whether a die is wholly within the walls of the tray. */
function isInside(body: Body, shape: DieShape, tray: Tray): boolean {
  const radius = dieRadiusOf(shape);
  return Math.abs(body.position.x) < tray.halfWidth - radius && Math.abs(body.position.y) < tray.halfDepth - radius;
}

function addDie(world: World, shape: DieShape, material: Material): Body {
  const poly = polyhedronOf(shape);
  const radius = dieRadiusOf(shape);
  const solid = new ConvexPolyhedron({
    vertices: poly.vertices.map(([x, y, z]) => new Vec3(x * radius, y * radius, z * radius)),
    faces: poly.faces.map((face) => [...face]),
  });
  const body = new Body({
    mass: 1,
    material,
    shape: solid,
    linearDamping: LINEAR_DAMPING,
    angularDamping: ANGULAR_DAMPING,
    allowSleep: true,
    sleepSpeedLimit: 0.3,
    sleepTimeLimit: 0.25,
  });
  world.addBody(body);
  return body;
}

/**
 * Sets the dice off from outside one edge of the tray, a little above the floor and apart from each
 * other, each turned its own way and flung in, rolling forward as it goes, to come down a quarter
 * to a half of the way across and tumble on from there.
 */
function launch(bodies: Body[], shapes: readonly DieShape[], tray: Tray, edge: ThrowEdge, random: () => number) {
  const alongX = edge !== 'near';
  const inward = edge === 'right' ? -1 : 1;
  const depth = alongX ? tray.halfWidth : tray.halfDepth;
  const span = alongX ? tray.halfDepth : tray.halfWidth;
  // Far enough apart that the largest of them start clear of each other.
  const pitch = 2 * Math.max(...shapes.map(dieRadiusOf)) + 0.2;
  const perRow = Math.max(1, Math.floor((span * 2 - 0.6) / pitch));
  bodies.forEach((body, index) => {
    const radius = dieRadiusOf(shapes[index]);
    const row = Math.floor(index / perRow);
    const column = index % perRow;
    const inRow = Math.min(perRow, bodies.length - row * perRow);
    const room = Math.max(0, span - radius - 0.3);
    const across = clamp((column - (inRow - 1) / 2) * pitch + (random() - 0.5) * 0.8, -room, room);
    const start = depth + radius + 0.5 + row * pitch;
    const height = radius + 2 + random() * 2.5 + row * 0.4;
    const rise = 4 + random() * 6;

    // Where it first comes down, and how fast it has to go to get there in the time it falls.
    const landing = -depth + depth * 2 * (0.12 + random() * 0.24);
    const landingAcross = clamp(across + (random() - 0.5) * span * 0.8, -room, room);
    const fall = (rise + Math.sqrt(rise * rise + 2 * GRAVITY * (height - radius))) / GRAVITY;
    const reach = landing + start;
    const sideways = landingAcross - across;

    const position = alongX ? new Vec3(-inward * start, across, height) : new Vec3(across, -start, height);
    const velocity = alongX
      ? new Vec3((inward * reach) / fall, sideways / fall, rise)
      : new Vec3(sideways / fall, reach / fall, rise);
    body.position.copy(position);
    body.velocity.copy(velocity);
    body.quaternion.copy(randomRotation(random));

    // Spinning forward about the axis it would roll on, with a twist of its own thrown in.
    const ground = new Vec3(velocity.x, velocity.y, 0);
    const speed = ground.length();
    const rollAxis = new Vec3(0, 0, 1).cross(ground);
    rollAxis.normalize();
    const twist = new Vec3(random() - 0.5, random() - 0.5, random() - 0.5);
    twist.normalize();
    const roll = (speed / radius) * (0.5 + random() * 0.6);
    const spin = 8 + random() * 14;
    body.angularVelocity.set(
      rollAxis.x * roll + twist.x * spin,
      rollAxis.y * roll + twist.y * spin,
      rollAxis.z * roll + twist.z * spin
    );
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** A rotation drawn evenly from all of them. */
function randomRotation(random: () => number): Quaternion {
  const u1 = random();
  const u2 = random() * 2 * Math.PI;
  const u3 = random() * 2 * Math.PI;
  const a = Math.sqrt(1 - u1);
  const b = Math.sqrt(u1);
  return new Quaternion(a * Math.sin(u2), a * Math.cos(u2), b * Math.sin(u3), b * Math.cos(u3));
}
