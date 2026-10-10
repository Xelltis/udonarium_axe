/** What a die is made of, which sets how it takes the light. */
export const DICE_MATERIALS = ['resin', 'marble', 'metal', 'glass'] as const;
export type DiceMaterial = (typeof DICE_MATERIALS)[number];

/**
 * How a picture is put on a die: wrapped round it, running on across the edges between faces with
 * each die showing a part of its own, or laid whole on every face under the numbers.
 */
export const DICE_PICTURE_FITS = ['wrap', 'faces'] as const;
export type DicePictureFit = (typeof DICE_PICTURE_FITS)[number];

/**
 * How the one who rolls wants their dice to look, which everyone sees them in.
 *
 * An empty body is the colour the roll was said in, and an empty ink is worked out to stand out
 * from the body, so a look that sets neither changes nothing but the material. A die wears a
 * picture as resin: the picture is its pattern, and marble's swirl or metal's sheen would fight it.
 * The material chosen is kept under the picture all the same, for dice drawn without it: once it
 * comes off, or on a line that does not carry it, as a guest's.
 */
export interface DiceLook {
  readonly material: DiceMaterial;
  /** The colour of the dice, as `#rrggbb`, or empty for the colour of the roll. */
  readonly body: string;
  /** The colour of their numbers, as `#rrggbb`, or empty for one that stands out from the body. */
  readonly ink: string;
  /** The identifier of the picture the dice wear, as the room's images know it, or empty for none. */
  readonly picture: string;
  /** How the picture is put on the dice. */
  readonly pictureFit: DicePictureFit;
}

/** The dice as they were before anyone chose otherwise: resin, in the colour of the roll. */
export const PLAIN_DICE_LOOK: DiceLook = { material: 'resin', body: '', ink: '', picture: '', pictureFit: 'wrap' };

const HEX_COLOR = /^#[0-9a-f]{6}$/;
/** What an image the room keeps is known by: the hash of its bytes. */
const IMAGE_IDENTIFIER = /^[0-9a-f]{64}$/;

/** Whether a look is the plain one, which a line has no need to carry. */
export function isPlainDiceLook(look: DiceLook): boolean {
  return look.material === 'resin' && look.body === '' && look.ink === '' && look.picture === '';
}

/**
 * A look as a line carries it: nothing for the plain one, and only what differs from it otherwise.
 *
 * The picture is left out: a line carries it in an attribute of its own, named so that saving the
 * room keeps the picture with it. The material is written as chosen, under a picture too.
 */
export function encodeDiceLook(look: DiceLook): string {
  const tidy = asDiceLook(look);
  const written: Record<string, string> = {};
  if (tidy.material !== 'resin') written['material'] = tidy.material;
  if (tidy.body) written['body'] = tidy.body;
  if (tidy.ink) written['ink'] = tidy.ink;
  if (tidy.picture && tidy.pictureFit !== 'wrap') written['pictureFit'] = tidy.pictureFit;
  return Object.keys(written).length > 0 ? JSON.stringify({ material: tidy.material, ...written }) : '';
}

/**
 * Reads the look a line carries, with the picture it carries beside it, as the dice wear it. Nothing,
 * as on a line said before looks were offered, is the plain look; so is anything that cannot be
 * read. A material this version does not know, from a later one, is read as resin, and a colour that
 * is not one is left to the default.
 */
export function decodeDiceLook(raw: unknown, picture: unknown = ''): DiceLook {
  let fields: unknown = {};
  if (typeof raw === 'string' && raw.length > 0) {
    try {
      fields = JSON.parse(raw);
    } catch {
      fields = {};
    }
  }
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) fields = {};
  return wornDiceLook(asDiceLook({ ...(fields as Record<string, unknown>), picture }));
}

/**
 * Anything at all read as a look as it was chosen, keeping what makes sense of it and the default
 * for the rest. The material is kept under a picture: see `wornDiceLook`.
 */
export function asDiceLook(raw: unknown): DiceLook {
  if (!raw || typeof raw !== 'object') return PLAIN_DICE_LOOK;
  const fields = raw as Record<string, unknown>;
  const picture =
    typeof fields['picture'] === 'string' && IMAGE_IDENTIFIER.test(fields['picture']) ? fields['picture'] : '';
  const material = DICE_MATERIALS.find((known) => known === fields['material']) ?? 'resin';
  const pictureFit = DICE_PICTURE_FITS.find((known) => known === fields['pictureFit']) ?? 'wrap';
  return { material, body: colorOf(fields['body']), ink: colorOf(fields['ink']), picture, pictureFit };
}

/** A look as the dice wear it: resin while they wear a picture, whatever material was chosen. */
export function wornDiceLook(look: DiceLook): DiceLook {
  return look.picture && look.material !== 'resin' ? { ...look, material: 'resin' } : look;
}

function colorOf(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const color = raw.trim().toLowerCase();
  return HEX_COLOR.test(color) ? color : '';
}
