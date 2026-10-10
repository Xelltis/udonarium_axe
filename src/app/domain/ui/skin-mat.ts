import { asLayer, SkinLayer } from '@axe/domain/ui/skin-layer';

/** The felt the dice land on in a line's frame where no skin says otherwise, as it shows on screen. */
export const DEFAULT_MAT_COLOR = '#3e424a';

/**
 * What a skin lays under the dice in a line's frame: a colour of felt, and a picture over it where
 * one is chosen, fitted like a layer of the skin's panels.
 */
export interface DiceMat {
  readonly color: string;
  readonly layer: SkinLayer | null;
}

/** The mat every frame had before skins could lay one. */
export const PLAIN_MAT: DiceMat = { color: DEFAULT_MAT_COLOR, layer: null };

const HEX_COLOR = /^#[0-9a-f]{6}$/;

/** A mat read back out of what a browser or a file kept, with anything that is not one left to the default. */
export function asDiceMat(value: unknown): DiceMat {
  if (!value || typeof value !== 'object') return PLAIN_MAT;
  const raw = value as Record<string, unknown>;
  const color = typeof raw['color'] === 'string' ? raw['color'].trim().toLowerCase() : '';
  return { color: HEX_COLOR.test(color) ? color : DEFAULT_MAT_COLOR, layer: asLayer(raw['layer']) };
}

/** The mat from the JSON text a browser kept. Nothing kept, or text that cannot be read, is the plain mat. */
export function parseMat(text: string | null): DiceMat {
  if (!text) return PLAIN_MAT;
  try {
    return asDiceMat(JSON.parse(text));
  } catch {
    return PLAIN_MAT;
  }
}
