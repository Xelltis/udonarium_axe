import { inject, Injectable, signal, type WritableSignal } from '@angular/core';
import { MODEL_VIEWER_LOADER } from '@axe/application/media/model-viewer-loader';
import type { ModelFile } from '@axe/core/storage/model-file';
import { placeableModelIconUrl } from '@axe/domain/tabletop/placeable-models';
import type { ModelPainter } from '@axe/infrastructure/model-viewer/model-viewer-port';

/** How many pixels across a model's picture in the list of models is drawn. */
const PICTURE_PX = 192;

/** What a model's picture is while it is taken, and once it is. */
type Taken = { readonly url: string | null };

/**
 * The pictures the list of models shows each model held here by. A model bundled with the app that
 * the map editor offers is shown by the picture bundled with it; any other is drawn the first time
 * its picture is asked for, a model at a time, and kept for as long as the page is open. Nothing is
 * drawn for a model whose bytes have not come, nor where the browser cannot draw.
 */
@Injectable({ providedIn: 'root' })
export class ModelPictureService {
  private readonly loadViewer = inject(MODEL_VIEWER_LOADER);
  private readonly pictures = new Map<string, WritableSignal<Taken>>();
  private painter: Promise<ModelPainter | null> | null = null;

  /** The picture of a model, or null while it is being drawn, before its bytes come, or where none can be. */
  pictureOf(model: ModelFile): string | null {
    const bundled = placeableModelIconUrl(model.name.replace(/\.glb$/i, ''));
    if (bundled) return bundled;
    let taken = this.pictures.get(model.identifier);
    if (!taken) {
      if (!model.isReady) return null;
      taken = signal<Taken>({ url: null });
      this.pictures.set(model.identifier, taken);
      void this.draw(model.url, taken);
    }
    return taken().url;
  }

  private async draw(url: string, taken: WritableSignal<Taken>): Promise<void> {
    const painter = await this.painterNow();
    const picture = painter ? await painter.paint(url, PICTURE_PX) : null;
    if (picture) taken.set({ url: URL.createObjectURL(picture) });
  }

  private painterNow(): Promise<ModelPainter | null> {
    this.painter ??= this.loadViewer().then((viewer) => viewer?.createModelPainter() ?? null);
    return this.painter;
  }
}
