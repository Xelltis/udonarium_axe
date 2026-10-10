import { Injectable, signal } from '@angular/core';
import { formatFoldedSections, parseFoldedSections } from '@axe/domain/character/sheet-fold';

const FOLDED_STORAGE_KEY = 'ui-sheet-folded';

/**
 * Which sections of a character sheet this reader keeps folded.
 *
 * Kept in this browser rather than in the room, since it is a way of reading a sheet: one player
 * folds the parts list away, another reads nothing else. A section is known by its name, which
 * stays the same when the room is loaded again where its identifier does not, so folding the
 * skills of one character folds them on another sheet that has them too.
 */
@Injectable({ providedIn: 'root' })
export class SheetViewPreferenceService {
  private readonly folded = signal<readonly string[]>(storedFolded());

  /** Whether the section of this name is folded. */
  isFolded(name: string): boolean {
    return this.folded().includes(name);
  }

  /** Folds or opens the section of this name, and writes it down. */
  setFolded(name: string, folded: boolean): void {
    const rest = this.folded().filter((held) => held !== name);
    this.save(folded ? [...rest, name] : rest);
  }

  /** Folds every one of these sections, or opens them all. */
  setAllFolded(names: readonly string[], folded: boolean): void {
    const rest = this.folded().filter((held) => !names.includes(held));
    this.save(folded ? [...rest, ...names] : rest);
  }

  private save(names: readonly string[]): void {
    this.folded.set(names);
    try {
      localStorage.setItem(FOLDED_STORAGE_KEY, formatFoldedSections(names));
    } catch {
      // Private browsing refuses the write; the folds still hold for this session.
    }
  }
}

function storedFolded(): string[] {
  try {
    return parseFoldedSections(localStorage.getItem(FOLDED_STORAGE_KEY));
  } catch {
    return [];
  }
}
