import { inject, Injectable } from '@angular/core';
import { localDispatch } from '@axe/core/network/network-messaging';
import { bundledModelName, bundledModelUrl } from '@axe/core/storage/bundled-models';
import { calcSHA256Async } from '@axe/core/storage/file-reader-util';
import { MODEL_TYPE } from '@axe/core/storage/model-file';
import { ModelStorage } from '@axe/core/storage/model-storage';

/**
 * Reads the models bundled with the app from beside the page into the models held here, as the
 * table comes to draw a piece that names one. Each seat reads its own, so none is waited for from
 * a peer, and a room that never draws one never reads it.
 */
@Injectable({ providedIn: 'root' })
export class BundledModelsService {
  private readonly modelStorage = inject(ModelStorage);
  private readonly asked = new Set<string>();

  /**
   * Reads a bundled model in, once, unless it is held here already; a model not bundled is left to
   * come from peers. Bytes that are not what the identifier names are not taken in.
   */
  read(identifier: string): void {
    const name = bundledModelName(identifier);
    if (!name || this.asked.has(identifier) || this.modelStorage.get(identifier)?.isReady) return;
    this.asked.add(identifier);
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
