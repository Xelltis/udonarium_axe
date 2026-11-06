import { inject, Injectable } from '@angular/core';
import { localDispatch } from '@axe/core/network/network-messaging';
import { bundledModelName, bundledModelUrl } from '@axe/core/storage/bundled-models';
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
export class BundledModelsService {
  private readonly modelStorage = inject(ModelStorage);
  /** When each model was last asked for, in milliseconds of the page's clock. */
  private readonly askedAt = new Map<string, number>();

  /**
   * Reads a bundled model in, unless it is held here already or was asked for a moment ago; a model
   * not bundled is left to come from peers. Bytes that are not what the identifier names are not taken
   * in. A model that could not be read, as one asked for while the page was offline, is asked for
   * again once a while has passed.
   */
  read(identifier: string): void {
    const name = bundledModelName(identifier);
    if (!name || this.modelStorage.get(identifier)?.isReady) return;
    const asked = this.askedAt.get(identifier);
    if (asked !== undefined && performance.now() - asked < BUNDLED_MODEL_RETRY_MS) return;
    this.askedAt.set(identifier, performance.now());
    void (async () => {
      try {
        const response = await fetch(bundledModelUrl(name));
        if (!response.ok) return;
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
      }
    })();
  }
}
