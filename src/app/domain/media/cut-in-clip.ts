/**
 * The outline a layer is cut down to.
 *
 * A cut-in window is rarely a plain rectangle: it leans, or it has a torn edge, or it
 * bursts. None of that can be drawn with a box, so a layer carries a shape and every
 * corner of it is written here once, as fractions of the layer's own box. The browser is
 * handed the same figures as a clip-path that the video export is handed as a path.
 */

export const CUT_IN_CLIPS = [
  'none',
  'slant',
  'slantBack',
  'torn',
  'tornLeft',
  'gash',
  'burst',
  'star',
  'chevron',
  'circle',
] as const;
export type CutInClip = (typeof CUT_IN_CLIPS)[number];

export type ClipPoint = readonly [number, number];

/** Whether a stored value names one of the outlines a layer can be cut down to. */
export function isCutInClip(value: unknown): value is CutInClip {
  return typeof value === 'string' && (CUT_IN_CLIPS as readonly string[]).includes(value);
}

/** How far a leaning window's top edge is pushed across, as a fraction of its width. */
const LEAN = 0.14;
/** How deep the teeth of a torn edge bite, and how many there are. */
const TEAR = 0.045;
const TEETH = 9;

const SHAPES: Record<Exclude<CutInClip, 'none' | 'circle'>, readonly ClipPoint[]> = {
  slant: [
    [LEAN, 0],
    [1, 0],
    [1 - LEAN, 1],
    [0, 1],
  ],
  slantBack: [
    [0, 0],
    [1 - LEAN, 0],
    [1, 1],
    [LEAN, 1],
  ],
  torn: tornOutline(true, true),
  tornLeft: tornOutline(false, true),
  gash: gashOutline(),
  burst: burstOutline(),
  star: starOutline(),
  chevron: [
    [0, 0],
    [0.82, 0],
    [1, 0.5],
    [0.82, 1],
    [0, 1],
    [0.18, 0.5],
  ],
};

/** The corners of a shape, or none where the layer keeps its own box. */
export function clipPoints(clip: CutInClip): readonly ClipPoint[] {
  if (clip === 'none' || clip === 'circle') return [];
  return SHAPES[clip];
}

/** What the browser is told, or nothing at all where the layer keeps its own box. */
export function clipCss(clip: CutInClip): string {
  if (clip === 'none') return '';
  if (clip === 'circle') return 'ellipse(50% 50% at 50% 50%)';

  const corners = clipPoints(clip).map(([x, y]) => `${round(x * 100)}% ${round(y * 100)}%`);
  return `polygon(${corners.join(', ')})`;
}

/**
 * An edge bitten into teeth.
 *
 * The teeth are laid out from a fixed pattern rather than drawn at random, so every
 * screen in the room tears the same way and a saved room tears the way it was saved.
 */
function tornOutline(right: boolean, left: boolean): readonly ClipPoint[] {
  const bites = [0.6, 1, 0.35, 0.85, 0.15, 0.7, 1, 0.45, 0.9];
  const points: ClipPoint[] = [[0, 0]];

  points.push([1, 0]);
  if (right) {
    for (let tooth = 1; tooth < TEETH; tooth++) {
      const along = tooth / TEETH;
      points.push([1 - TEAR * bites[tooth % bites.length], along - 0.5 / TEETH]);
      points.push([1, along]);
    }
  }
  points.push([1, 1]);
  points.push([0, 1]);
  if (left) {
    for (let tooth = TEETH - 1; tooth > 0; tooth--) {
      const along = tooth / TEETH;
      points.push([TEAR * bites[(tooth + 3) % bites.length], along + 0.5 / TEETH]);
      points.push([0, along]);
    }
  }
  return points;
}

/**
 * A tear ripped across: long, coming to a point at either end, and ragged along its
 * length by only a little.
 *
 * The teeth bite a small way in rather than halfway across — paper gives way in
 * splinters, not in saw teeth — and the shape narrows towards each end, so it reads as
 * something torn open rather than a band with a pattern cut into it.
 *
 * The corners are written out rather than worked out, because a tear that came out
 * differently on each screen would not be the same cut-in twice.
 */
function gashOutline(): readonly ClipPoint[] {
  const top: ClipPoint[] = [
    [0, 0.5],
    [0.03, 0.4],
    [0.06, 0.33],
    [0.09, 0.39],
    [0.13, 0.26],
    [0.17, 0.32],
    [0.22, 0.19],
    [0.27, 0.25],
    [0.33, 0.13],
    [0.39, 0.19],
    [0.45, 0.09],
    [0.51, 0.15],
    [0.57, 0.07],
    [0.63, 0.14],
    [0.69, 0.1],
    [0.75, 0.18],
    [0.8, 0.13],
    [0.85, 0.23],
    [0.89, 0.18],
    [0.93, 0.3],
    [0.96, 0.25],
    [1, 0.47],
  ];
  const bottom: ClipPoint[] = [
    [0.97, 0.61],
    [0.94, 0.73],
    [0.9, 0.67],
    [0.86, 0.8],
    [0.81, 0.75],
    [0.76, 0.86],
    [0.7, 0.81],
    [0.64, 0.91],
    [0.58, 0.86],
    [0.52, 0.94],
    [0.46, 0.89],
    [0.4, 0.95],
    [0.34, 0.9],
    [0.28, 0.84],
    [0.23, 0.88],
    [0.18, 0.79],
    [0.14, 0.83],
    [0.1, 0.71],
    [0.06, 0.76],
    [0.03, 0.63],
  ];
  return [...top, ...bottom];
}

function burstOutline(): readonly ClipPoint[] {
  const spikes = 14;
  const reach = [1, 0.74, 0.94, 0.7, 1, 0.78, 0.9];
  const points: ClipPoint[] = [];

  for (let spike = 0; spike < spikes * 2; spike++) {
    const angle = (spike / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
    const out = spike % 2 === 0 ? reach[(spike / 2) % reach.length] : 0.52;
    points.push([0.5 + (Math.cos(angle) * out) / 2, 0.5 + (Math.sin(angle) * out) / 2]);
  }
  return points;
}

function starOutline(): readonly ClipPoint[] {
  const points: ClipPoint[] = [];
  for (let corner = 0; corner < 10; corner++) {
    const angle = (corner / 10) * Math.PI * 2 - Math.PI / 2;
    const out = corner % 2 === 0 ? 1 : 0.42;
    points.push([0.5 + (Math.cos(angle) * out) / 2, 0.5 + (Math.sin(angle) * out) / 2]);
  }
  return points;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
