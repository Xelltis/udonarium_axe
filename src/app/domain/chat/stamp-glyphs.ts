/**
 * The seals the stamps are drawn as, written out as SVG on a 100 by 100 field.
 *
 * Each is built once for its colour and words and kept, since a busy log draws the same few many
 * times over.
 */

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

const ROUGH_INK =
  `<filter id="axe-stamp-seal-rough" filterUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">` +
  `<feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7" result="noise"/>` +
  `<feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -3 0 0 0 2.5" result="ink"/>` +
  `<feComposite in="SourceGraphic" in2="ink" operator="in"/>` +
  `</filter>`;

const CJK = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+$/u;

/**
 * The round seal of a name stamp with the words inside.
 *
 * The rings are in ink that has not taken everywhere; the words are left whole and drawn heavy, with
 * an edge of their own colour, so they read at the size of a stamp on a line. One character fills
 * the seal; two of the scripts written downward stand one above the other, as on a seal; anything
 * else runs across, pressed to fit.
 */
export function sealStampSvg(words: string, color: string): string {
  return remember(`seal:${words}:${color}`, () => {
    const letters = Array.from(words.trim());
    const ink =
      `fill="${color}" stroke="${color}" stroke-width="2.4" stroke-linejoin="round" paint-order="stroke fill"` +
      ` font-family="'Hiragino Mincho ProN', 'Yu Mincho', 'Noto Serif JP', serif" font-weight="900" text-anchor="middle"`;
    let text: string;
    if (letters.length <= 1) {
      text = `<text x="50" y="70" font-size="56" ${ink}>${escapeText(letters.join(''))}</text>`;
    } else if (letters.length === 2 && CJK.test(words.trim())) {
      text =
        `<text x="50" y="46" font-size="35" ${ink}>${escapeText(letters[0])}</text>` +
        `<text x="50" y="81" font-size="35" ${ink}>${escapeText(letters[1])}</text>`;
    } else {
      const size = Math.max(20, Math.min(40, Math.floor(150 / letters.length)));
      const fit = letters.length >= 4 ? ' textLength="70" lengthAdjust="spacingAndGlyphs"' : '';
      text = `<text x="50" y="${Math.round(50 + size * 0.35)}" font-size="${size}"${fit} ${ink}>${escapeText(letters.join(''))}</text>`;
    }
    return svg(
      `<defs>${ROUGH_INK}</defs>` +
        `<g filter="url(#axe-stamp-seal-rough)">` +
        `<circle cx="50" cy="50" r="45" fill="none" stroke="${color}" stroke-width="6.5"/>` +
        `<circle cx="50" cy="50" r="40" fill="none" stroke="${color}" stroke-width="1.5"/>` +
        `</g>` +
        text
    );
  });
}
