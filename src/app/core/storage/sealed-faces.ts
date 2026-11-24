import { readLocal, writeLocal } from '@axe/core/storage/local-preference';

const SEALED_FACES_KEY = 'axe-sealed-dice-faces';

/** How many dice this browser keeps the faces of, the latest kept first: dice long gone fall off the end. */
export const MOST_SEALED_FACES = 500;

/**
 * The faces of the dice this browser's seat keeps from everyone, the game master included, by the
 * identifier of each die. They are kept nowhere but here, written down in this browser so they last
 * a reload, and held in memory where the browser refuses to write them. Another tab of the page
 * keeps its own in the same place: what it writes is read again here as it comes, and what is
 * written here is written over what is there now, so neither tab's faces are lost to the other's.
 */
let held: Map<string, string> | null = null;
/** Whether the browser keeps what is written, as one blocking site data does not: only then is it read again. */
let durable = true;
let followingOtherTabs = false;
/** Who is told of the dice whose faces another tab changed. */
const changedElsewhere = new Set<(identifiers: readonly string[]) => void>();

/** The faces kept, as last read; what cannot be read is as if nothing were kept. */
function faces(): Map<string, string> {
  followOtherTabs();
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
    held.clear();
  }
  return held;
}

/** The faces as they are kept now, read again where the browser keeps them, for a change to be written over. */
function current(): Map<string, string> {
  if (durable) held = null;
  return faces();
}

function written(): void {
  const kept = [...faces()].slice(-MOST_SEALED_FACES);
  held = new Map(kept);
  durable = writeLocal(SEALED_FACES_KEY, kept.length > 0 ? JSON.stringify(Object.fromEntries(kept)) : null);
}

/**
 * Reads the faces again once another tab has written them, and tells of the dice whose faces are now
 * other than they were read here.
 */
function followOtherTabs(): void {
  if (followingOtherTabs || typeof window === 'undefined') return;
  followingOtherTabs = true;
  window.addEventListener('storage', (event) => {
    if (event.key !== SEALED_FACES_KEY && event.key !== null) return;
    const before = held;
    held = null;
    if (!before) return;
    const after = faces();
    const changed = [...new Set([...before.keys(), ...after.keys()])].filter(
      (identifier) => before.get(identifier) !== after.get(identifier)
    );
    if (changed.length > 0) for (const listener of changedElsewhere) listener(changed);
  });
}

/**
 * Tells a listener of the dice whose faces another tab of the page changed, as it rolled or sealed
 * them there, for what this tab draws of them to be drawn anew. Answers how to stop telling it.
 */
export function onSealedFacesChangedElsewhere(listener: (identifiers: readonly string[]) => void): () => void {
  followOtherTabs();
  changedElsewhere.add(listener);
  return () => changedElsewhere.delete(listener);
}

/** The face this browser keeps for a die, or null where it keeps none. */
export function sealedFaceOf(identifier: string): string | null {
  return faces().get(identifier) ?? null;
}

/** Keeps the face of a die in this browser alone, as the latest kept. */
export function keepSealedFace(identifier: string, face: string): void {
  const kept = current();
  kept.delete(identifier);
  kept.set(identifier, face);
  written();
}

/** Lets go of the face this browser kept for a die. */
export function forgetSealedFace(identifier: string): void {
  if (!current().delete(identifier)) return;
  written();
}

/** Forgets what was read from the browser, so the next question reads it afresh, as a page loaded anew does. */
export function rereadSealedFaces(): void {
  held = null;
  durable = true;
}
