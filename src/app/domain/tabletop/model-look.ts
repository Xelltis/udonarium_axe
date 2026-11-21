import { clamp } from '@axe/core/util/clamp';
import { recordOf, storedRecordOf } from '@axe/core/util/stored-record';

/**
 * How the surface of a model is shaded: as it was made, with its metal, its roughness and its bumps;
 * matt, taking the light evenly whatever it is made of; or in the flat bands of a drawn figure.
 */
export type ModelFinish = '' | 'matte' | 'toon';

/** The finishes a model may be given, as they are offered. */
export const MODEL_FINISHES: readonly ModelFinish[] = ['', 'matte', 'toon'];

/** How strong a glow may be set, as many times its colour. */
export const MAX_MODEL_GLOW = 8;

/** How many of a model's materials may be given a look of their own. */
export const MAX_MODEL_LOOK_MATERIALS = 64;

/** How long the key of a material may be to be given a look of its own. */
const MAX_MATERIAL_NAME = 80;

/**
 * What is changed of how a material of a model is drawn, each left as the model was made where it is
 * not set: an empty colour, or null for a number.
 */
export interface MaterialLook {
  /** The colour its own is multiplied by, as `#rrggbb`. */
  readonly tint: string;
  /** Whether it is drawn in its colour alone, without its picture, as a statue or a shadow is. */
  readonly plain: boolean;
  /** How like metal it is, from 0 to 1. */
  readonly metalness: number | null;
  /** How rough it is, from 0 for a mirror to 1. */
  readonly roughness: number | null;
  /** The colour it gives off of its own, as `#rrggbb`. */
  readonly glow: string;
  /** How strongly it gives that colour off, from 0 to `MAX_MODEL_GLOW`. */
  readonly glowStrength: number | null;
  /** How solid it is, from 0 for nothing to 1. */
  readonly opacity: number | null;
  /** Whether it is left undrawn. */
  readonly hidden: boolean;
}

/**
 * How a model is drawn for one piece or block: its finish and what is changed of all its materials,
 * and what is changed of single ones over that, by the key `materialKeyOf` gives each
 * (`core/storage/gltf-facts`).
 */
export interface ModelLook extends MaterialLook {
  readonly finish: ModelFinish;
  readonly materials: Readonly<Record<string, MaterialLook>>;
}

/** A material drawn as it was made. */
export const AS_MADE: MaterialLook = Object.freeze({
  tint: '',
  plain: false,
  metalness: null,
  roughness: null,
  glow: '',
  glowStrength: null,
  opacity: null,
  hidden: false,
});

/** A model drawn as it was made. */
export const MODEL_AS_MADE: ModelLook = Object.freeze({ ...AS_MADE, finish: '', materials: Object.freeze({}) });

/** The look a model was stored with: as it was made where nothing was stored, or what was cannot be read. */
export function modelLookOf(value: unknown): ModelLook {
  const source = storedRecordOf(value);
  if (!source) return MODEL_AS_MADE;
  const materials: Record<string, MaterialLook> = {};
  const stored = recordOf(source['materials']);
  for (const key of Object.keys(stored ?? {}).slice(0, MAX_MODEL_LOOK_MATERIALS)) {
    const named = key.trim().slice(0, MAX_MATERIAL_NAME);
    const look = materialLookOf(recordOf(stored![key]), true);
    if (named && !isAsMade(look)) materials[named] = look;
  }
  const finish = source['finish'];
  return {
    ...materialLookOf(source, false),
    finish: MODEL_FINISHES.includes(finish as ModelFinish) ? (finish as ModelFinish) : '',
    materials,
  };
}

/**
 * A look as it is stored: only what differs from the model as made, its materials in the order of
 * their keys, so two looks alike are stored alike; empty for a model drawn as it was made.
 */
export function writeModelLook(look: ModelLook): string {
  const written: Record<string, unknown> = { ...writtenMaterial(look) };
  delete written['hidden'];
  if (look.finish) written['finish'] = look.finish;
  const materials: Record<string, unknown> = {};
  for (const key of Object.keys(look.materials).sort()) {
    const one = writtenMaterial(look.materials[key]);
    if (Object.keys(one).length > 0) materials[key] = one;
  }
  if (Object.keys(materials).length > 0) written['materials'] = materials;
  return Object.keys(written).length > 0 ? JSON.stringify(written) : '';
}

/** A look read and written again, which two looks alike share: what a drawing of a model is kept by. */
export function modelLookKeyOf(value: unknown): string {
  return writeModelLook(modelLookOf(value));
}

/** How one material of a model is drawn: what is set for it alone, over what is set for the whole model. */
export function materialLookIn(look: ModelLook, key: string): MaterialLook {
  const own = look.materials[key];
  if (!own) return look;
  return {
    tint: own.tint || look.tint,
    plain: own.plain || look.plain,
    metalness: own.metalness ?? look.metalness,
    roughness: own.roughness ?? look.roughness,
    glow: own.glow || look.glow,
    glowStrength: own.glowStrength ?? look.glowStrength,
    opacity: own.opacity ?? look.opacity,
    hidden: own.hidden,
  };
}

/** Whether nothing is changed of a material. */
export function isAsMade(look: MaterialLook): boolean {
  return Object.keys(writtenMaterial(look)).length === 0;
}

/** A look with one of its materials given a look of its own, or with that taken back where nothing is changed of it. */
export function withMaterialLook(look: ModelLook, key: string, material: MaterialLook): ModelLook {
  const materials = { ...look.materials };
  if (isAsMade(material)) delete materials[key];
  else materials[key] = material;
  return { ...look, materials };
}

function materialLookOf(source: Record<string, unknown> | null, single: boolean): MaterialLook {
  if (!source) return AS_MADE;
  return {
    tint: colourOf(source['tint']),
    plain: source['plain'] === true,
    metalness: shareOf(source['metalness'], 1),
    roughness: shareOf(source['roughness'], 1),
    glow: colourOf(source['glow']),
    glowStrength: shareOf(source['glowStrength'], MAX_MODEL_GLOW),
    opacity: shareOf(source['opacity'], 1),
    hidden: single && source['hidden'] === true,
  };
}

function writtenMaterial(look: MaterialLook): Record<string, unknown> {
  const written: Record<string, unknown> = {};
  if (look.tint) written['tint'] = look.tint;
  if (look.plain) written['plain'] = true;
  if (look.metalness !== null) written['metalness'] = look.metalness;
  if (look.roughness !== null) written['roughness'] = look.roughness;
  if (look.glow) written['glow'] = look.glow;
  if (look.glowStrength !== null) written['glowStrength'] = look.glowStrength;
  if (look.opacity !== null) written['opacity'] = look.opacity;
  if (look.hidden) written['hidden'] = true;
  return written;
}

/** A colour as `#rrggbb` in small letters, or empty for anything else. */
function colourOf(value: unknown): string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim().toLowerCase() : '';
}

/** A number from 0 to the most it may be, rounded to a thousandth, or null for anything that is no number. */
function shareOf(value: unknown, most: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.round(clamp(value, 0, most) * 1000) / 1000;
}
