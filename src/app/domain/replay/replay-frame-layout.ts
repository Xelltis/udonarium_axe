export interface ReplayFrameSize {
  width: number;
  height: number;
}

export interface ReplayFrameLayout {
  width: number;
  height: number;
  scale: number;
  portrait: { x: number; y: number; maxWidth: number; maxHeight: number };
  box: { x: number; y: number; width: number; height: number; radius: number };
  name: { x: number; y: number; fontSize: number };
  body: { x: number; y: number; width: number; fontSize: number; lineHeight: number; maxLines: number };
  chapter: { x: number; y: number; fontSize: number };
  board: { x: number; y: number; width: number; height: number; minPiece: number };
  progress: { x: number; y: number; width: number; height: number };
}

const REFERENCE_WIDTH = 1920;
const REFERENCE_HEIGHT = 1080;

export const REPLAY_FRAME_PRESETS: Readonly<Record<string, ReplayFrameSize>> = {
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
  '1440p': { width: 2560, height: 1440 },
  '2160p': { width: 3840, height: 2160 },
};

/**
 * Where each part of a replay video frame goes at the given size: the portrait, the dialogue box
 * with its name and text, the chapter title, the board and the progress bar.
 *
 * It is laid out for 1920 by 1080 and scaled by whichever side fits tighter.
 */
export function replayFrameLayout(size: ReplayFrameSize): ReplayFrameLayout {
  const scale = Math.min(size.width / REFERENCE_WIDTH, size.height / REFERENCE_HEIGHT);
  const at = (value: number): number => Math.round(value * scale);

  const boxHeight = at(300);
  const boxMargin = at(56);
  const boxWidth = size.width - boxMargin * 2;
  const boxY = size.height - boxHeight - boxMargin;
  const bodyPadding = at(44);

  return {
    width: size.width,
    height: size.height,
    scale,
    portrait: {
      x: at(120),
      y: boxY,
      maxWidth: Math.round(size.width * 0.42),
      maxHeight: boxY - at(40),
    },
    box: { x: boxMargin, y: boxY, width: boxWidth, height: boxHeight, radius: at(24) },
    name: { x: boxMargin + bodyPadding, y: boxY + at(56), fontSize: at(40) },
    body: {
      x: boxMargin + bodyPadding,
      y: boxY + at(110),
      width: boxWidth - bodyPadding * 2,
      fontSize: at(44),
      lineHeight: at(64),
      maxLines: 3,
    },
    chapter: { x: boxMargin, y: at(80), fontSize: at(36) },
    board: {
      x: at(24),
      y: at(96),
      width: size.width - at(48),
      height: boxY - at(112),
      minPiece: at(40),
    },
    progress: { x: 0, y: size.height - at(8), width: size.width, height: at(8) },
  };
}

export type ReplayTextMeasure = (text: string) => number;

/**
 * Breaks text into lines that fit a width, character by character, keeping its own line breaks.
 *
 * At most `maxLines` come back, the last ending in an ellipsis when text was cut off. Nothing
 * comes back when there is no width or no line to fill.
 */
export function wrapReplayText(measure: ReplayTextMeasure, text: string, maxWidth: number, maxLines: number): string[] {
  if (maxWidth <= 0 || maxLines < 1) return [];

  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (lines.length >= maxLines) break;
    if (paragraph.length < 1) {
      lines.push('');
      continue;
    }
    for (const line of wrapParagraph(measure, paragraph, maxWidth)) {
      if (lines.length >= maxLines) break;
      lines.push(line);
    }
  }

  if (lines.length < 1) return [];
  const overflowed = countWrapped(measure, text, maxWidth) > maxLines;
  if (overflowed) lines[lines.length - 1] = ellipsize(measure, lines[lines.length - 1], maxWidth);
  return lines.slice(0, maxLines);
}

function countWrapped(measure: ReplayTextMeasure, text: string, maxWidth: number): number {
  let count = 0;
  for (const paragraph of text.split('\n')) {
    count += paragraph.length < 1 ? 1 : wrapParagraph(measure, paragraph, maxWidth).length;
  }
  return count;
}

function wrapParagraph(measure: ReplayTextMeasure, paragraph: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const character of [...paragraph]) {
    const candidate = line + character;
    if (line.length > 0 && measure(candidate) > maxWidth) {
      lines.push(line);
      line = character;
      continue;
    }
    line = candidate;
  }
  if (line.length > 0) lines.push(line);
  return lines;
}

function ellipsize(measure: ReplayTextMeasure, line: string, maxWidth: number): string {
  const characters = [...line];
  while (characters.length > 0 && measure(`${characters.join('')}…`) > maxWidth) characters.pop();
  return `${characters.join('')}…`;
}

/**
 * Where to draw a picture so it covers the target entirely, scaled evenly and centred, with the
 * overflow off the edges.
 *
 * A picture with no size simply fills the target.
 */
export function coverRect(
  source: ReplayFrameSize,
  target: ReplayFrameSize
): { x: number; y: number; width: number; height: number } {
  if (source.width < 1 || source.height < 1) return { x: 0, y: 0, width: target.width, height: target.height };
  const scale = Math.max(target.width / source.width, target.height / source.height);
  const width = source.width * scale;
  const height = source.height * scale;
  return { x: (target.width - width) / 2, y: (target.height - height) / 2, width, height };
}

/**
 * A picture fitted inside a box.
 *
 * `grow` says whether one smaller than the box is blown up to fill it: that is what
 * `object-fit: contain` does, while a portrait laid beside the dialogue is only ever
 * brought down to size.
 */
export function containRect(
  source: ReplayFrameSize,
  maxWidth: number,
  maxHeight: number,
  grow = false
): { width: number; height: number } {
  if (source.width < 1 || source.height < 1) return { width: 0, height: 0 };
  const fitted = Math.min(maxWidth / source.width, maxHeight / source.height);
  const scale = grow ? fitted : Math.min(fitted, 1);
  return { width: source.width * scale, height: source.height * scale };
}
