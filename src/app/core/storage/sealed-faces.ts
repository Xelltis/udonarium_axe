import { readLocal, writeLocal } from '@axe/core/storage/local-preference';

const SEALED_FACES_KEY = 'axe-sealed-dice-faces';

/** How many dice this browser keeps the faces of, the latest kept first: dice long gone fall off the end. */
export const MOST_SEALED_FACES = 500;

/**
 * The faces of the dice this browser's seat keeps from everyone, the game master included, by the
 * identifier of each die. They are kept nowhere but here, written down in this browser so they last
 * a reload, and held in memory where the browser refuses to write them.
 */
let held: Map<string, string> | null = null;

function faces(): Map<string, string> {
  if (held) return held;
  held = new Map();
  try {
    const stored: unknown = JSON.parse(readLocal(SEALED_FACES_KEY) ?? '{}');
    if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
      for (const [identifier, face] of Object.entries(stored as Record<string, unknown>)) {
        if (typeof face === 'string') held.set(identifier, face);
      }
    }
  } catch {
    // What cannot be read is as if nothing were kept.
  }
  return held;
}

function written(): void {
  const kept = [...faces()].slice(-MOST_SEALED_FACES);
  held = new Map(kept);
  writeLocal(SEALED_FACES_KEY, kept.length > 0 ? JSON.stringify(Object.fromEntries(kept)) : null);
}

/** The face this browser keeps for a die, or null where it keeps none. */
export function sealedFaceOf(identifier: string): string | null {
  return faces().get(identifier) ?? null;
}

/** Keeps the face of a die in this browser alone, as the latest kept. */
export function keepSealedFace(identifier: string, face: string): void {
  const kept = faces();
  kept.delete(identifier);
  kept.set(identifier, face);
  written();
}

/** Lets go of the face this browser kept for a die. */
export function forgetSealedFace(identifier: string): void {
  if (!faces().delete(identifier)) return;
  written();
}

/** Forgets what was read from the browser, so the next question reads it afresh, as a page loaded anew does. */
export function rereadSealedFaces(): void {
  held = null;
}
