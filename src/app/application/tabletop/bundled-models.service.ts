import { inject, Injectable, OnDestroy } from '@angular/core';
import { localDispatch } from '@axe/core/network/network-messaging';
import { bundledModelName, bundledPieceModelUrl } from '@axe/core/storage/bundled-models';
import { calcSHA256Async } from '@axe/core/storage/file-reader-util';
import { MODEL_TYPE } from '@axe/core/storage/model-file';
import { ModelStorage } from '@axe/core/storage/model-storage';

/** How long a bundled model that could not be read is left before it is asked for again, in milliseconds. */
export const BUNDLED_MODEL_RETRY_MS = 30_000;

/**
 * Reads the models bundled with the app from beside the page into the models held here, as the
 * table comes to draw a piece that names one. Each seat reads its own, so none is waited for from
 * a peer, and a room that never draws one never reads it.
 */
@Injectable({ providedIn: 'root' })
export class BundledModelsService implements OnDestroy {
  private readonly modelStorage = inject(ModelStorage);
  /** The models that could not be read, each with when it is asked for again. */
  private readonly retries = new Map<string, ReturnType<typeof setTimeout>>();
  /** When each model was last asked for, in milliseconds of the page's clock. */
  private readonly askedAt = new Map<string, number>();
  private readonly reading = new Set<string>();
  private readonly settled: (() => void)[] = [];

  /**
   * Whether a model is bundled, not held here yet and still to come: not asked for yet, or being read
   * now. One that could not be read is not, until it is asked for again.
   */
  isComing(identifier: string): boolean {
    if (!bundledModelName(identifier) || this.modelStorage.get(identifier)?.isReady) return false;
    return !this.askedAt.has(identifier) || this.reading.has(identifier);
  }

  /** Calls back each time a model has been read in, or could not be. */
  onRead(listener: () => void): void {
    this.settled.push(listener);
  }

  /**
   * Reads a bundled model in, unless it is held here already or was asked for a moment ago; a model
   * not bundled is left to come from peers. Bytes that are not what the identifier names are not taken
   * in. A model that could not be read, as one asked for while the page was offline, is asked for
   * again once a while has passed, of itself: nothing else asks again for a model it is still missing.
   */
  read(identifier: string): void {
    const name = bundledModelName(identifier);
    if (!name || this.modelStorage.get(identifier)?.isReady) return;
    const asked = this.askedAt.get(identifier);
    if (asked !== undefined && performance.now() - asked < BUNDLED_MODEL_RETRY_MS) return;
    this.askedAt.set(identifier, performance.now());
    this.reading.add(identifier);
    void (async () => {
      let unread = true;
      try {
        const response = await fetch(bundledPieceModelUrl(name));
        if (!response.ok) return;
        unread = false;
        const bytes = await response.arrayBuffer();
        if ((await calcSHA256Async(bytes)) !== identifier) return;
        const context = {
          identifier,
          name: `${name}.glb`,
          type: MODEL_TYPE,
          blob: new Blob([bytes], { type: MODEL_TYPE }),
          url: '',
        };
        this.modelStorage.add(context);
        localDispatch('UPDATE_MODEL_RESOURE', [context]);
      } catch {
        return;
      } finally {
        this.reading.delete(identifier);
        if (unread) this.askAgainLater(identifier);
        for (const listener of this.settled) listener();
      }
    })();
  }

  /** Stops asking again for the models that could not be read, as the page lets the table go. */
  ngOnDestroy(): void {
    for (const retry of this.retries.values()) clearTimeout(retry);
    this.retries.clear();
  }

  private askAgainLater(identifier: string): void {
    clearTimeout(this.retries.get(identifier));
    this.retries.set(
      identifier,
      setTimeout(() => {
        this.retries.delete(identifier);
        this.read(identifier);
      }, BUNDLED_MODEL_RETRY_MS)
    );
  }
}
