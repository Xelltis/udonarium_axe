/**
 * The pictures the stamps are drawn as, written out as SVG on a 100 by 100 field.
 *
 * Each is built once for its colour and words and kept, since a busy log draws the same few many
 * times over.
 */

const INK = '#2b2622';
const OUTLINE = `stroke="${INK}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"`;

const remembered = new Map<string, string>();

function remember(key: string, build: () => string): string {
  const kept = remembered.get(key);
  if (kept !== undefined) return kept;
  if (remembered.size >= 128) remembered.clear();
  const built = build();
  remembered.set(key, built);
  return built;
}

function svg(body: string): string {
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" aria-hidden="true">${body}</svg>`;
}

function escapeText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** A twenty-sided die face on, showing the number it came up. */
function d20(color: string, number: string, numberColor: string, cracked: boolean): string {
  const facets =
    `<polygon points="50,6 89,28 89,72 50,94 11,72 11,28" fill="${color}" ${OUTLINE}/>` +
    `<polygon points="50,24 76,68 24,68" fill="#ffffff" fill-opacity="0.22" ${OUTLINE} stroke-width="3"/>` +
    `<path d="M50 6 L50 24 M89 28 L76 68 M11 28 L24 68 M89 72 L76 68 M11 72 L24 68 M50 94 L76 68 M50 94 L24 68 M11 28 L50 24 M89 28 L50 24" fill="none" ${OUTLINE} stroke-width="2.5"/>`;
  const crack = cracked ? `<path d="M30 12 L40 30 L33 41 L44 56" fill="none" ${OUTLINE} stroke-width="3"/>` : '';
  const shine = cracked
    ? ''
    : `<path d="M86 8 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z" fill="#fff6c2" ${OUTLINE} stroke-width="2"/>`;
  const label =
    `<text x="50" y="${number.length > 1 ? 61 : 62}" text-anchor="middle" font-family="Arial Black, Arial, sans-serif"` +
    ` font-weight="900" font-size="${number.length > 1 ? 24 : 28}" fill="${numberColor}"` +
    ` stroke="${INK}" stroke-width="1.5" paint-order="stroke fill">${number}</text>`;
  return facets + crack + label + shine;
}

function skull(color: string): string {
  return (
    `<path d="M50 10 C28 10 16 26 16 44 C16 56 22 63 28 67 L28 80 L72 80 L72 67 C78 63 84 56 84 44 C84 26 72 10 50 10 Z" fill="${color}" ${OUTLINE}/>` +
    `<ellipse cx="36" cy="46" rx="9" ry="10" fill="${INK}"/>` +
    `<ellipse cx="64" cy="46" rx="9" ry="10" fill="${INK}"/>` +
    `<path d="M50 56 L45 65 L55 65 Z" fill="${INK}"/>` +
    `<path d="M38 80 L38 90 M50 80 L50 92 M62 80 L62 90" fill="none" ${OUTLINE} stroke-width="3.5"/>` +
    `<path d="M34 90 L66 90" fill="none" ${OUTLINE}/>`
  );
}

function sword(color: string): string {
  return (
    `<g transform="rotate(45 50 50)">` +
    `<path d="M50 4 L58 16 L58 66 L42 66 L42 16 Z" fill="${color}" ${OUTLINE}/>` +
    `<path d="M50 12 L50 62" stroke="#ffffff" stroke-opacity="0.6" stroke-width="3"/>` +
    `<rect x="28" y="64" width="44" height="8" rx="3" fill="#d9a521" ${OUTLINE}/>` +
    `<rect x="45" y="72" width="10" height="16" rx="2" fill="#7a4a24" ${OUTLINE}/>` +
    `<circle cx="50" cy="92" r="5" fill="#d9a521" ${OUTLINE}/>` +
    `</g>`
  );
}

function shield(color: string): string {
  return (
    `<path d="M50 8 L84 18 C84 52 72 78 50 92 C28 78 16 52 16 18 Z" fill="${color}" ${OUTLINE}/>` +
    `<path d="M50 18 L74 25 C74 51 65 70 50 81 C35 70 26 51 26 25 Z" fill="none" stroke="#ffffff" stroke-opacity="0.45" stroke-width="3"/>` +
    `<path d="M50 30 L50 70 M34 44 L66 44" fill="none" stroke="#f3d36b" stroke-width="7" stroke-linecap="round"/>`
  );
}

function magnifier(color: string): string {
  return (
    `<path d="M62 62 L88 88" fill="none" stroke="${color}" stroke-width="13" stroke-linecap="round"/>` +
    `<path d="M62 62 L88 88" fill="none" ${OUTLINE} stroke-width="3" stroke-opacity="0.6"/>` +
    `<circle cx="42" cy="42" r="28" fill="#cfe8ff" fill-opacity="0.75" ${OUTLINE}/>` +
    `<circle cx="42" cy="42" r="28" fill="none" stroke="${color}" stroke-width="7"/>` +
    `<path d="M28 34 A16 16 0 0 1 40 24" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round"/>`
  );
}

function candle(color: string): string {
  return (
    `<path d="M50 6 C60 18 62 26 56 34 C53 38 47 38 44 34 C38 26 42 16 50 6 Z" fill="#ffb21f" ${OUTLINE} stroke-width="3"/>` +
    `<path d="M50 18 C54 24 54 28 51 31 C49 33 47 31 47 29 C46 25 48 22 50 18 Z" fill="#fff3b0"/>` +
    `<path d="M50 36 L50 44" stroke="${INK}" stroke-width="3"/>` +
    `<path d="M34 44 L66 44 L66 86 L34 86 Z" fill="${color}" ${OUTLINE}/>` +
    `<path d="M40 44 C40 52 44 54 44 60" fill="none" stroke="#fff8d6" stroke-width="5" stroke-linecap="round"/>` +
    `<path d="M24 86 L76 86 L72 94 L28 94 Z" fill="#8a8f99" ${OUTLINE}/>`
  );
}

function potion(color: string): string {
  return (
    `<rect x="40" y="6" width="20" height="12" rx="3" fill="#a8763e" ${OUTLINE}/>` +
    `<path d="M42 18 L58 18 L58 34 C74 40 84 52 84 66 C84 84 68 94 50 94 C32 94 16 84 16 66 C16 52 26 40 42 34 Z" fill="#e8f4ff" fill-opacity="0.9" ${OUTLINE}/>` +
    `<path d="M20 64 C30 58 40 70 50 64 C60 58 70 70 80 64 C80 82 66 90 50 90 C34 90 20 82 20 64 Z" fill="${color}"/>` +
    `<path d="M50 84 C40 76 36 72 36 67 C36 63 39 61 42 61 C45 61 48 63 50 66 C52 63 55 61 58 61 C61 61 64 63 64 67 C64 72 60 76 50 84 Z" fill="#ffffff" fill-opacity="0.85"/>` +
    `<path d="M28 48 A26 26 0 0 1 40 38" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round"/>`
  );
}

const MOTIFS: Readonly<Record<string, (color: string) => string>> = {
  critical: (color) => d20(color, '20', '#ffffff', false),
  fumble: (color) => d20(color, '1', '#ffffff', true),
  skull,
  sword,
  shield,
  magnifier,
  candle,
  potion,
};

/** The picture of a stamp from the table-marks family, or empty for a key it does not draw. */
export function motifStampSvg(key: string, color: string): string {
  const draw = MOTIFS[key];
  if (!draw) return '';
  return remember(`motif:${key}:${color}`, () => svg(draw(color)));
}

const ROUGH_INK =
  `<filter id="axe-stamp-seal-rough" x="0" y="0" width="100%" height="100%">` +
  `<feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7" result="noise"/>` +
  `<feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -3 0 0 0 2.5" result="ink"/>` +
  `<feComposite in="SourceGraphic" in2="ink" operator="in"/>` +
  `</filter>`;

const CJK = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+$/u;

/**
 * The round seal of a name stamp with the words inside, in ink that has not taken everywhere.
 *
 * One character fills the seal; two of the scripts written downward stand one above the other, as
 * on a seal; anything else runs across, pressed to fit.
 */
export function sealStampSvg(words: string, color: string): string {
  return remember(`seal:${words}:${color}`, () => {
    const letters = Array.from(words.trim());
    const ink = `fill="${color}" font-family="'Hiragino Mincho ProN', 'Yu Mincho', 'Noto Serif JP', serif" font-weight="700" text-anchor="middle"`;
    let text: string;
    if (letters.length <= 1) {
      text = `<text x="50" y="66" font-size="48" ${ink}>${escapeText(letters.join(''))}</text>`;
    } else if (letters.length === 2 && CJK.test(words.trim())) {
      text =
        `<text x="50" y="47" font-size="32" ${ink}>${escapeText(letters[0])}</text>` +
        `<text x="50" y="80" font-size="32" ${ink}>${escapeText(letters[1])}</text>`;
    } else {
      const size = Math.max(18, Math.min(34, Math.floor(120 / letters.length)));
      const fit = letters.length >= 4 ? ' textLength="66" lengthAdjust="spacingAndGlyphs"' : '';
      text = `<text x="50" y="${50 + size * 0.36}" font-size="${size}"${fit} ${ink}>${escapeText(letters.join(''))}</text>`;
    }
    return svg(
      `<defs>${ROUGH_INK}</defs>` +
        `<g filter="url(#axe-stamp-seal-rough)">` +
        `<circle cx="50" cy="50" r="44" fill="none" stroke="${color}" stroke-width="6"/>` +
        `<circle cx="50" cy="50" r="38" fill="none" stroke="${color}" stroke-width="1.5"/>` +
        text +
        `</g>`
    );
  });
}
