export interface DestroyHandle {
  onDestroy(callback: () => void): () => void;
}

export interface ReadableChannel<T = void> {
  subscribe(listener: (event: T) => void, destroyRef?: DestroyHandle): () => void;
}

export class EventChannel<T = void> implements ReadableChannel<T> {
  private readonly _listeners = new Set<(event: T) => void>();
  private snapshot: readonly ((event: T) => void)[] = [];

  /**
   * Adds a listener and gives back the function that removes it.
   *
   * Given a destroy handle such as Angular's DestroyRef, the listener is removed when it is
   * destroyed. The same function subscribed twice is held once.
   */
  subscribe(listener: (event: T) => void, destroyRef?: DestroyHandle): () => void {
    this._listeners.add(listener);
    this.snapshot = [...this._listeners];
    const remove = (): void => {
      this._listeners.delete(listener);
      this.snapshot = [...this._listeners];
    };
    destroyRef?.onDestroy(remove);
    return remove;
  }

  /**
   * Calls every listener with the event, synchronously and in subscription order.
   *
   * A listener added during an emit waits for the next one; one removed during it is skipped.
   */
  emit(event: T): void {
    const snapshot = this.snapshot;
    for (const listener of snapshot) {
      if (this._listeners.has(listener)) {
        listener(event);
      }
    }
  }

  /** How many listeners are subscribed right now. */
  get listenerCount(): number {
    return this._listeners.size;
  }
}

/**
 * A channel that remembers its last value and replays it to whoever subscribes later.
 *
 * For a one-off state notice, such as the configuration finishing loading, so that emitting
 * before anyone subscribes loses nothing. Where the value is already there, subscribing
 * delivers it at once; existing listeners still hear it at emit time as usual.
 */
export class StickyEventChannel<T = void> extends EventChannel<T> {
  private hasLastEvent = false;
  private lastEvent!: T;

  /** Remembers the event as the last one, then delivers it to the current listeners. */
  override emit(event: T): void {
    this.hasLastEvent = true;
    this.lastEvent = event;
    super.emit(event);
  }

  /** Subscribes, and calls the new listener at once with the last event if one was emitted. */
  override subscribe(listener: (event: T) => void, destroyRef?: DestroyHandle): () => void {
    const remove = super.subscribe(listener, destroyRef);
    if (this.hasLastEvent) listener(this.lastEvent);
    return remove;
  }
}
