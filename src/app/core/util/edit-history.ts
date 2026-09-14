/**
 * What an editor can take back and put again.
 *
 * The stack holds copies rather than the thing being edited, so what is handed back is
 * never the same object the editor went on to change. How a copy is made is left to
 * whoever builds one, since only they know what the value is.
 */
export class EditHistory<T> {
  private readonly clone: (value: T) => T;
  private readonly limit: number;
  private undoStack: T[];
  private redoStack: T[] = [];

  constructor(initial: T, clone: (value: T) => T, limit = 50) {
    this.clone = clone;
    this.limit = limit;
    this.undoStack = [clone(initial)];
  }

  /**
   * Records the state after an edit, dropping anything that could have been redone and the
   * oldest states beyond the limit.
   */
  commit(value: T): void {
    this.undoStack.push(this.clone(value));
    this.redoStack = [];
    while (this.undoStack.length > this.limit + 1) {
      this.undoStack.shift();
    }
  }

  /** Steps back one state and returns a copy of it, or null when already at the oldest state kept. */
  undo(): T | null {
    if (this.undoStack.length <= 1) return null;
    const current = this.undoStack.pop()!;
    this.redoStack.push(current);
    return this.clone(this.undoStack[this.undoStack.length - 1]);
  }

  /** Steps forward to a state undone earlier and returns a copy of it, or null when there is none. */
  redo(): T | null {
    if (this.redoStack.length === 0) return null;
    const next = this.redoStack.pop()!;
    this.undoStack.push(next);
    return this.clone(next);
  }

  /** Whether `undo` has a state to step back to. */
  canUndo(): boolean {
    return this.undoStack.length > 1;
  }

  /** Whether `redo` has a state to step forward to. */
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Starts the history over from this state, forgetting everything that could be undone or redone. */
  reset(value: T): void {
    this.undoStack = [this.clone(value)];
    this.redoStack = [];
  }
}
