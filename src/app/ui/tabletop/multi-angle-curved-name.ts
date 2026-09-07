export interface MultiAngleCurvedNameLayout {
  readonly svgSize: number;
  readonly offset: number;
  readonly radius: number;
  readonly fontSize: number;
  readonly letterSpacing: number;
  readonly minimumGap: number;
  readonly strokeWidth: number;
  readonly path: string;
  readonly text: string;
  readonly paddedText: string;
  readonly repeatCount: number;
  readonly startOffsets: readonly string[];
  readonly separatorOffsets: readonly string[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function glyphWidthEm(character: string): number {
  if (/\s/u.test(character)) return 0.35;
  return (character.codePointAt(0) ?? 0) <= 0x7f ? 0.62 : 1;
}

function estimateArcLength(text: string, fontSize: number, letterSpacing: number): number {
  const characters = Array.from(text);
  const glyphs = characters.reduce((total, character) => total + glyphWidthEm(character) * fontSize, 0);
  return glyphs + Math.max(0, characters.length - 1) * letterSpacing;
}

function truncateNameToArc(name: string, maxArcLength: number, fontSize: number, letterSpacing: number): string {
  const characters = Array.from(name.trim());
  if (estimateArcLength(characters.join(''), fontSize, letterSpacing) <= maxArcLength) return characters.join('');

  const kept: string[] = [];
  for (const character of characters) {
    const candidate = `${kept.join('')}${character}…`;
    if (estimateArcLength(candidate, fontSize, letterSpacing) > maxArcLength) break;
    kept.push(character);
  }
  return `${kept.join('')}…`;
}

/**
 * Places one name on a counter-clockwise SVG path whose bottom tangent reads normally.
 * The containing DOM layer performs the visible clockwise orbit.
 */
export function makeMultiAngleCurvedName(name: string, pieceDiameter: number): MultiAngleCurvedNameLayout {
  const diameter = Math.max(1, pieceDiameter);
  const fontSize = clamp(diameter * 0.2, 10, 15);
  const radius = diameter / 2 + fontSize * 1.05;
  const padding = fontSize * 2.2;
  const svgSize = diameter + padding * 2;
  const center = svgSize / 2;
  const left = (center - radius).toFixed(2);
  const right = (center + radius).toFixed(2);
  const cy = center.toFixed(2);
  const r = radius.toFixed(2);
  const circumference = 2 * Math.PI * radius;
  const letterSpacing = fontSize * 0.04;
  const minimumGap = fontSize * 2.4;
  const text = truncateNameToArc(name, circumference - minimumGap, fontSize, letterSpacing);
  const textArcLength = estimateArcLength(text, fontSize, letterSpacing);
  let repeatCount = 1;
  for (let candidate = 4; candidate >= 2; candidate--) {
    if (textArcLength + minimumGap <= circumference / candidate) {
      repeatCount = candidate;
      break;
    }
  }
  const startOffsets = Array.from({ length: repeatCount }, (_, index) => {
    const offset = ((0.75 + index / repeatCount) % 1) * 100;
    return `${Number(offset.toFixed(4))}%`;
  });
  const separatorOffsets =
    repeatCount > 1
      ? Array.from({ length: repeatCount }, (_, index) => {
          const offset = ((0.75 + (index + 0.5) / repeatCount) % 1) * 100;
          return `${Number(offset.toFixed(4))}%`;
        })
      : [];

  return {
    svgSize,
    offset: -padding,
    radius,
    fontSize,
    letterSpacing,
    minimumGap,
    strokeWidth: clamp(fontSize * 0.24, 2.5, 3.6),
    // right -> top -> left -> bottom -> right; at 75% the baseline points to the right.
    path: `M ${right} ${cy} A ${r} ${r} 0 0 0 ${left} ${cy} A ${r} ${r} 0 0 0 ${right} ${cy}`,
    text,
    paddedText: `\u00a0\u00a0${text}\u00a0\u00a0`,
    repeatCount,
    startOffsets,
    separatorOffsets,
  };
}
