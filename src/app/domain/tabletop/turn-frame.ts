/** A point of a face, in the face's own pixels. */
export interface FacePoint {
  readonly x: number;
  readonly y: number;
}

/**
 * What a thing that turns stands on, for the frame that turns it to be drawn round: the rectangle of
 * its foot on the face as it lies unturned, in the face's own pixels, the point it turns about and how
 * far it is turned, clockwise in degrees.
 */
export interface TurnFoot {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly depth: number;
  readonly pivot: FacePoint;
  readonly rotateDeg: number;
}

/**
 * How far outside the foot the frame runs, in the face's own pixels: far enough that the knobs on it
 * stay clear of the thing, for a press on the thing to reach the thing.
 */
export const TURN_FRAME_MARGIN_PX = 18;

/** How round the frame's corners are, in the face's own pixels. */
const CORNER_RADIUS_PX = 10;

/** How many points the frame's line is drawn through, round the whole of it. */
const LINE_POINTS = 96;

/**
 * The frame round a thing's foot that turns it: a rounded rectangle lying on the face a little
 * outside the foot, turned with the thing, with a knob at each corner and its front marked. Its own box is as wide and deep as the foot and the margin
 * round it, and everything in it is given in the box's own pixels, from its top left as the thing lies
 * unturned; `faceOf` carries such a point onto the face.
 */
export interface TurnFrame {
  readonly width: number;
  readonly depth: number;
  /** Where the corners of the box lie on the face, round from its top left. */
  readonly corners: readonly [FacePoint, FacePoint, FacePoint, FacePoint];
  /** Points along the frame's line, clockwise from the middle of its front edge, the last next to the first. */
  readonly line: readonly FacePoint[];
  /** The middle of the front edge, the side the thing faces, at the foot of the box as it lies unturned. */
  readonly front: FacePoint;
  /** The box's own corners, round from its top left, where the knobs that turn the thing stand. */
  readonly knobs: readonly [FacePoint, FacePoint, FacePoint, FacePoint];
  faceOf(local: FacePoint): FacePoint;
}

/** Points along a quarter of a circle, from one angle to the next, the first left out. */
function arc(centre: FacePoint, radius: number, from: number, steps: number): FacePoint[] {
  return Array.from({ length: steps }, (_, step) => {
    const angle = from + ((step + 1) / steps) * (Math.PI / 2);
    return { x: centre.x + radius * Math.cos(angle), y: centre.y + radius * Math.sin(angle) };
  });
}

/** Points along a straight run, from one point to another, the first left out. */
function run(from: FacePoint, to: FacePoint, steps: number): FacePoint[] {
  return Array.from({ length: steps }, (_, step) => {
    const along = (step + 1) / steps;
    return { x: from.x + (to.x - from.x) * along, y: from.y + (to.y - from.y) * along };
  });
}

/**
 * Points along a rounded rectangle of a size, from the middle of its bottom edge round clockwise as
 * the face is seen from above, about as many as asked, spread by the length of each stretch.
 */
function roundedLine(width: number, depth: number, radius: number, points: number): FacePoint[] {
  const r = Math.min(radius, width / 2, depth / 2);
  const straightAcross = width - 2 * r;
  const straightDown = depth - 2 * r;
  const perimeter = 2 * straightAcross + 2 * straightDown + 2 * Math.PI * r;
  const stepsFor = (length: number) => Math.max(1, Math.round((length / perimeter) * points));
  const quarter = stepsFor((Math.PI * r) / 2);
  const middle = { x: width / 2, y: depth };
  return [
    middle,
    ...run(middle, { x: r, y: depth }, stepsFor(straightAcross / 2)),
    ...arc({ x: r, y: depth - r }, r, Math.PI / 2, quarter),
    ...run({ x: 0, y: depth - r }, { x: 0, y: r }, stepsFor(straightDown)),
    ...arc({ x: r, y: r }, r, Math.PI, quarter),
    ...run({ x: r, y: 0 }, { x: width - r, y: 0 }, stepsFor(straightAcross)),
    ...arc({ x: width - r, y: r }, r, (3 * Math.PI) / 2, quarter),
    ...run({ x: width, y: r }, { x: width, y: depth - r }, stepsFor(straightDown)),
    ...arc({ x: width - r, y: depth - r }, r, 0, quarter),
    ...run({ x: width - r, y: depth }, middle, stepsFor(straightAcross / 2)).slice(0, -1),
  ];
}

/** The frame that turns a thing, drawn round its foot. */
export function turnFrame(foot: TurnFoot): TurnFrame {
  const margin = TURN_FRAME_MARGIN_PX;
  const width = foot.width + 2 * margin;
  const depth = foot.depth + 2 * margin;
  const turn = (foot.rotateDeg * Math.PI) / 180;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const faceOf = (local: FacePoint): FacePoint => {
    const dx = foot.left - margin + local.x - foot.pivot.x;
    const dy = foot.top - margin + local.y - foot.pivot.y;
    return { x: foot.pivot.x + dx * cos - dy * sin, y: foot.pivot.y + dx * sin + dy * cos };
  };
  return {
    width,
    depth,
    corners: [
      faceOf({ x: 0, y: 0 }),
      faceOf({ x: width, y: 0 }),
      faceOf({ x: width, y: depth }),
      faceOf({ x: 0, y: depth }),
    ],
    line: roundedLine(width, depth, CORNER_RADIUS_PX, LINE_POINTS),
    front: { x: width / 2, y: depth },
    knobs: [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: depth },
      { x: 0, y: depth },
    ],
    faceOf,
  };
}

/**
 * The SVG path of the stretches of a closed line whose points are seen, each drawn through its run of
 * seen points: the whole line closed where every point is, and nothing where none is.
 */
export function seenLinePath(line: readonly FacePoint[], seen: readonly boolean[]): string {
  const count = line.length;
  const at = (index: number) => `${Math.round(line[index].x * 10) / 10} ${Math.round(line[index].y * 10) / 10}`;
  if (seen.every(Boolean)) return `M ${line.map((_, index) => at(index)).join(' L ')} Z`;
  const hidden = seen.indexOf(false);
  if (hidden < 0) return '';
  const runs: number[][] = [];
  let current: number[] = [];
  for (let step = 1; step <= count; step++) {
    const index = (hidden + step) % count;
    if (seen[index]) {
      current.push(index);
    } else if (current.length > 0) {
      runs.push(current);
      current = [];
    }
  }
  if (current.length > 0) runs.push(current);
  return runs
    .filter((points) => points.length > 1)
    .map((points) => `M ${points.map(at).join(' L ')}`)
    .join(' ');
}
