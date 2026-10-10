import { DieLabels } from '@axe/domain/dice/dice-3d/dice-throw-plan';
import { DieShape, polyhedronOf } from '@axe/domain/dice/dice-3d/polyhedra';
import { atlasOf } from '@axe/infrastructure/dice-3d/dice-geometry';
import { FaceGlyph, faceGlyphsOf } from '@axe/infrastructure/dice-3d/dice-glyphs';
import { NUMERAL_GAP, NUMERAL_HEIGHT, NUMERALS } from '@axe/infrastructure/dice-3d/dice-numerals';

/** The colours of a die: its body, the ink in its numbers, and the accent of a d6's one pip. */
export interface DiceColors {
  readonly body: string;
  readonly ink: string;
  readonly accent: string;
}

/** The size of one face's cell, in texture pixels. */
export const CELL_PX = 256;

const DARK_INK = '#161616';
const LIGHT_INK = '#f6f3ec';
const ACCENT = '#c8102e';
/**
 * The engraving is worked out at half the size of the faces' picture: its edges are soft, so it
 * loses nothing, and there is a quarter of it to work out.
 */
const ENGRAVING_SCALE = 0.5;
/** How deep the engraving reads under the light, and how soft the edges of its cuts are, in its own pixels. */
const ENGRAVE_STRENGTH = 2.6 * ENGRAVING_SCALE;
const BLUR_RADIUS = 1;

/**
 * The colours of a die of a given body colour: the ink asked for, or else ink that stands out from
 * the body, light on a dark body and dark on a light one; and a red one pip unless the body is red
 * itself.
 */
export function lookFor(body: string, inkAskedFor = ''): DiceColors {
  const rgb = parseColor(body) ?? [32, 32, 36];
  const lightness = (0.2126 * linear(rgb[0]) + 0.7152 * linear(rgb[1]) + 0.0722 * linear(rgb[2])) ** (1 / 2.2);
  const asked = parseColor(inkAskedFor);
  const ink = asked ? rgbText(asked) : lightness > 0.55 ? DARK_INK : LIGHT_INK;
  const [r, g, b] = rgb;
  const reddish = r > 140 && r > g * 1.6 && r > b * 1.6;
  return { body: rgbText(rgb), ink, accent: reddish ? ink : ACCENT };
}

/** A picture as the faces are drawn with it: anything a canvas can draw, with its size. */
export type FacePicture = CanvasImageSource & { readonly width: number; readonly height: number };

/**
 * Draws the faces of a die: every face's cell in the body's colour, with its marks in the ink. A
 * picture laid on every face covers each cell over the body, which shows through where the picture
 * is clear, turned as the face's number is so the two stand upright together.
 */
export function drawDiceFaces(
  shape: DieShape,
  labels: DieLabels,
  look: DiceColors,
  picture: FacePicture | null = null
): HTMLCanvasElement {
  const atlas = atlasOf(shape);
  const canvas = canvasOf(atlas.columns * CELL_PX, atlas.rows * CELL_PX);
  const paint = canvas.getContext('2d')!;
  paint.fillStyle = look.body;
  paint.fillRect(0, 0, canvas.width, canvas.height);
  if (picture) eachFace(shape, labels, (glyphs, left, top) => coverCell(paint, picture, left, top, uprightOf(glyphs)));
  eachGlyph(shape, labels, (glyph, left, top) =>
    drawGlyph(paint, glyph, left, top, glyph.accent ? look.accent : look.ink, CELL_PX)
  );
  return canvas;
}

/**
 * The average colour of a picture, as `#rrggbb`, weighed by how much of each part shows: what the
 * ink of a die wearing it is worked out to stand out from. Null where the page cannot look into it.
 */
export function averageColorOf(picture: FacePicture): string | null {
  const sample = canvasOf(8, 8);
  const paint = sample.getContext('2d', { willReadFrequently: true });
  if (!paint) return null;
  paint.drawImage(picture, 0, 0, 8, 8);
  const data = paint.getImageData(0, 0, 8, 8).data;
  let [r, g, b, weight] = [0, 0, 0, 0];
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3] / 255;
    r += data[i] * alpha;
    g += data[i + 1] * alpha;
    b += data[i + 2] * alpha;
    weight += alpha;
  }
  if (weight <= 0) return null;
  const hex = (value: number) =>
    Math.round(value / weight)
      .toString(16)
      .padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/** Visits every face with its marks and the top left corner of its cell in the faces' picture. */
function eachFace(
  shape: DieShape,
  labels: DieLabels,
  visit: (glyphs: readonly FaceGlyph[], left: number, top: number) => void
): void {
  const atlas = atlasOf(shape);
  const faces = polyhedronOf(shape).faces.length;
  for (let face = 0; face < faces; face++) {
    const left = (face % atlas.columns) * CELL_PX;
    const top = Math.floor(face / atlas.columns) * CELL_PX;
    visit(faceGlyphsOf(shape, labels, face), left, top);
  }
}

/** Which way is up on a face, as its middle mark stands; a face with none there, as a d4's, is not turned. */
function uprightOf(glyphs: readonly FaceGlyph[]): number {
  const middle = glyphs.find((glyph) => Math.hypot(glyph.x - 0.5, glyph.y - 0.5) < 0.2);
  return middle?.rotation ?? 0;
}

/** Lays a picture over a cell, filling it and turned about its middle. */
function coverCell(
  paint: CanvasRenderingContext2D,
  picture: FacePicture,
  left: number,
  top: number,
  rotation: number
): void {
  const scale = CELL_PX / Math.min(picture.width, picture.height);
  const [width, height] = [picture.width * scale, picture.height * scale];
  paint.save();
  paint.beginPath();
  paint.rect(left, top, CELL_PX, CELL_PX);
  paint.clip();
  paint.translate(left + CELL_PX / 2, top + CELL_PX / 2);
  paint.rotate(-rotation);
  paint.drawImage(picture, -width / 2, -height / 2, width, height);
  paint.restore();
}

/**
 * Draws the engraving of a die's marks as the normals of a surface they are cut into, so they
 * catch the light as engraving does. It is the same whatever the die's colours, so one serves every
 * die of a shape numbered the same way.
 */
export function drawDiceEngraving(shape: DieShape, labels: DieLabels): HTMLCanvasElement {
  const depth = drawDiceMarks(shape, labels);
  const carve = depth.getContext('2d', { willReadFrequently: true })!;
  const normal = canvasOf(depth.width, depth.height);
  normalsFromDepth(carve.getImageData(0, 0, depth.width, depth.height), normal.getContext('2d')!);
  return normal;
}

/**
 * Draws where a die's marks lie, white on black, at the engraving's size: what a die made of
 * something other than plain resin is told by, so its marks stay paint while the rest of it is
 * marble, metal or glass. One serves every die of a shape numbered the same way.
 */
export function drawDiceMarks(shape: DieShape, labels: DieLabels): HTMLCanvasElement {
  const atlas = atlasOf(shape);
  const cell = CELL_PX * ENGRAVING_SCALE;
  const marks = canvasOf(atlas.columns * cell, atlas.rows * cell);
  const paint = marks.getContext('2d', { willReadFrequently: true })!;
  paint.fillStyle = '#000';
  paint.fillRect(0, 0, marks.width, marks.height);
  eachGlyph(shape, labels, (glyph, left, top) =>
    drawGlyph(paint, glyph, left * ENGRAVING_SCALE, top * ENGRAVING_SCALE, '#fff', cell)
  );
  return marks;
}

/** Visits every mark of a die with the top left corner of its face's cell in the faces' picture. */
function eachGlyph(
  shape: DieShape,
  labels: DieLabels,
  visit: (glyph: FaceGlyph, left: number, top: number) => void
): void {
  eachFace(shape, labels, (glyphs, left, top) => {
    for (const glyph of glyphs) visit(glyph, left, top);
  });
}

function drawGlyph(
  ctx: CanvasRenderingContext2D,
  glyph: FaceGlyph,
  left: number,
  top: number,
  fill: string,
  cell: number
): void {
  const x = left + glyph.x * cell;
  const y = top + (1 - glyph.y) * cell;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-glyph.rotation);
  ctx.fillStyle = fill;
  if (glyph.kind === 'pip') {
    const radius = (glyph.size * cell) / 2;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  // Set by the figures' own ink, so the number sits in the middle of the face.
  const figures = [...glyph.text].map((figure) => NUMERALS[figure]).filter(Boolean);
  const width =
    figures.reduce((sum, figure) => sum + figure.right - figure.left, 0) + NUMERAL_GAP * (figures.length - 1);
  const scale = (glyph.size * cell) / NUMERAL_HEIGHT;
  ctx.scale(scale, scale);
  ctx.translate(-width / 2, NUMERAL_HEIGHT / 2);
  let pen = 0;
  for (const figure of figures) {
    ctx.save();
    ctx.translate(pen - figure.left, 0);
    ctx.fill(new Path2D(figure.outline));
    ctx.restore();
    pen += figure.right - figure.left + NUMERAL_GAP;
  }
  if (glyph.underline) {
    const line = Math.max(width * 0.8, NUMERAL_HEIGHT * 0.45);
    ctx.fillRect((width - line) / 2, NUMERAL_HEIGHT * 0.12, line, NUMERAL_HEIGHT * 0.09);
  }
  ctx.restore();
}

/**
 * Turns the marks into the normals of a surface they are cut into: blurred a little for a soft
 * edge to the cut, then each pixel tilted down the slope of its neighbours.
 */
function normalsFromDepth(depth: ImageData, out: CanvasRenderingContext2D): void {
  const { width, height } = depth;
  const heights = boxBlur(redChannel(depth), width, height, BLUR_RADIUS);
  const image = out.createImageData(width, height);
  const at = (x: number, y: number) =>
    heights[Math.min(height - 1, Math.max(0, y)) * width + Math.min(width - 1, Math.max(0, x))];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Cut in, so the surface falls where the marks are: its slope across is their rise across,
      // and up the texture, which runs against the rows, is their fall down the rows.
      const dx = ((at(x + 1, y) - at(x - 1, y)) / 2) * ENGRAVE_STRENGTH;
      const dy = (-(at(x, y + 1) - at(x, y - 1)) / 2) * ENGRAVE_STRENGTH;
      const length = Math.hypot(dx, dy, 1);
      const i = (y * width + x) * 4;
      image.data[i] = Math.round(((dx / length) * 0.5 + 0.5) * 255);
      image.data[i + 1] = Math.round(((dy / length) * 0.5 + 0.5) * 255);
      image.data[i + 2] = Math.round(((1 / length) * 0.5 + 0.5) * 255);
      image.data[i + 3] = 255;
    }
  }
  out.putImageData(image, 0, 0);
}

function redChannel(image: ImageData): Float32Array {
  const values = new Float32Array(image.width * image.height);
  for (let i = 0; i < values.length; i++) values[i] = image.data[i * 4] / 255;
  return values;
}

/** A blur by two passes of a running box, across and then down. */
function boxBlur(values: Float32Array, width: number, height: number, radius: number): Float32Array {
  const across = new Float32Array(values.length);
  const down = new Float32Array(values.length);
  const span = radius * 2 + 1;
  for (let y = 0; y < height; y++) {
    let sum = 0;
    for (let x = -radius; x <= radius; x++) sum += values[y * width + Math.min(width - 1, Math.max(0, x))];
    for (let x = 0; x < width; x++) {
      across[y * width + x] = sum / span;
      sum += values[y * width + Math.min(width - 1, x + radius + 1)] - values[y * width + Math.max(0, x - radius)];
    }
  }
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let y = -radius; y <= radius; y++) sum += across[Math.min(height - 1, Math.max(0, y)) * width + x];
    for (let y = 0; y < height; y++) {
      down[y * width + x] = sum / span;
      sum += across[Math.min(height - 1, y + radius + 1) * width + x] - across[Math.max(0, y - radius) * width + x];
    }
  }
  return down;
}

function canvasOf(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function parseColor(text: string): [number, number, number] | null {
  const hex = text.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const digits = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1];
    return [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16)) as [number, number, number];
  }
  const rgb = text.trim().match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : null;
}

function linear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function rgbText([r, g, b]: [number, number, number]): string {
  return `rgb(${r}, ${g}, ${b})`;
}
