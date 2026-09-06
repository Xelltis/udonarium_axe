export interface ChatTickerPathSegment {
  readonly x: number;
  readonly y: number;
  readonly dx: number;
  readonly dy: number;
  readonly length: number;
  readonly degrees: 0 | 90 | 180 | 270;
}

export interface ChatTickerPath {
  readonly margin: number;
  readonly perimeter: number;
  readonly segments: readonly ChatTickerPathSegment[];
}

export interface ChatTickerPoint {
  readonly x: number;
  readonly y: number;
  readonly degrees: 0 | 90 | 180 | 270;
}

export interface ChatTickerMessageLike {
  readonly name?: string;
  readonly text?: string;
  readonly isDirect?: boolean;
  readonly isSecret?: boolean;
  readonly isSystem?: boolean;
}

export const MAX_CHAT_TICKER_REPETITIONS = 8;

/**
 * Positive path orientation keeps the glyph tops facing inward: bottom, right, top, then left.
 * Animation subtracts travelled pixels from the path distance, making the bottom edge move right-to-left.
 */
export function makeChatTickerPath(width: number, height: number, fontSize: number): ChatTickerPath | null {
  const margin = Math.round(fontSize * 0.85) + 9;
  const horizontal = width - margin * 2;
  const vertical = height - margin * 2;
  if (!(horizontal > 0) || !(vertical > 0)) return null;

  const segments: readonly ChatTickerPathSegment[] = [
    { x: margin, y: height - margin, dx: 1, dy: 0, length: horizontal, degrees: 0 },
    { x: width - margin, y: height - margin, dx: 0, dy: -1, length: vertical, degrees: 270 },
    { x: width - margin, y: margin, dx: -1, dy: 0, length: horizontal, degrees: 180 },
    { x: margin, y: margin, dx: 0, dy: 1, length: vertical, degrees: 90 },
  ];
  return { margin, perimeter: horizontal * 2 + vertical * 2, segments };
}

export function normalizeTickerDistance(distance: number, perimeter: number): number {
  if (!(perimeter > 0)) return 0;
  return ((distance % perimeter) + perimeter) % perimeter;
}

export function pointAtChatTickerDistance(path: ChatTickerPath, distance: number): ChatTickerPoint {
  let remaining = normalizeTickerDistance(distance, path.perimeter);
  for (const segment of path.segments) {
    if (remaining <= segment.length) {
      return {
        x: segment.x + segment.dx * remaining,
        y: segment.y + segment.dy * remaining,
        degrees: segment.degrees,
      };
    }
    remaining -= segment.length;
  }
  const first = path.segments[0];
  return { x: first.x, y: first.y, degrees: first.degrees };
}

/**
 * Distributes as many copies as fit around the perimeter without crowding them.
 * Short messages therefore fill all four edges, while long messages automatically use fewer copies.
 */
export function makeChatTickerRepeatOffsets(
  perimeter: number,
  textWidth: number,
  minimumGap: number
): readonly number[] {
  if (!(perimeter > 0) || !(textWidth > 0)) return [];
  const gap = Number.isFinite(minimumGap) ? Math.max(0, minimumGap) : 0;
  const fitCount = Math.floor(perimeter / (textWidth + gap));
  const count = Math.max(1, Math.min(MAX_CHAT_TICKER_REPETITIONS, fitCount));
  const interval = perimeter / count;
  return Array.from({ length: count }, (_, index) => interval * index);
}

export function formatChatTickerMessage(message: ChatTickerMessageLike): string | null {
  if (message.isDirect || message.isSecret || message.isSystem) return null;
  const text = (message.text ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const name = (message.name ?? '').replace(/\s+/g, ' ').trim();
  return `${name ? `${name}：` : ''}${text}　◆`;
}
