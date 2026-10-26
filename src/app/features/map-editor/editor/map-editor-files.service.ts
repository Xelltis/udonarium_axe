import { inject, Injectable } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { FunctionalPaintService } from '@axe/application/tabletop/functional-paint.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { ImageFile } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { downloadBlob } from '@axe/core/util/download-blob';
import { deserializeScene } from '@axe/domain/map-editor/serialize';
import { STAMPS } from '@axe/domain/map-editor/stamps';
import { planFunctionPaint, sceneSpeaksFor } from '@axe/domain/map-editor/table-apply';
import { sceneFromTable } from '@axe/domain/map-editor/table-import';
import { MapEditorState } from '@axe/features/map-editor/editor/map-editor-state';
import { exportSceneToBlob } from '@axe/infrastructure/map-editor/export-image';
import { isZipArchive } from '@axe/infrastructure/map-editor/scene-archive';
import { packSceneWithImages, unpackSceneWithImages } from '@axe/infrastructure/map-editor/scene-archive-images';

/** What laying what was painted on the table came to: done, no table to lay it on, or a table of another grid. */
export type FunctionApplyResult = 'done' | 'noTable' | 'gridMismatch';

/**
 * What a map editor reads from files and writes out: the scene as an archive, the scene baked into
 * a picture, and the table the scene is brought in from or laid on.
 *
 * Provided with the editor's own state, one apiece.
 */
@Injectable()
export class MapEditorFilesService {
  private readonly state = inject(MapEditorState);
  private readonly imageStorage = inject(ImageStorage);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly tabletopService = inject(TabletopService);
  private readonly functionalPaint = inject(FunctionalPaintService);

  private readonly exportFn = exportSceneToBlob;

  /** Downloads the scene and the pictures it uses as one archive. */
  async download(): Promise<void> {
    const archive = await packSceneWithImages(this.state.current, this.imageStorage);
    const blob = new Blob([archive.slice()], { type: 'application/zip' });
    downloadBlob(blob, 'map.zip');
  }

  /** Opens the scene in a file, an archive or the older bare JSON; false where the file holds none. */
  async open(file: Blob): Promise<boolean> {
    const buffer = new Uint8Array(await file.arrayBuffer());
    const scene = isZipArchive(buffer)
      ? await unpackSceneWithImages(buffer, this.imageStorage, () =>
          this.objectChange.notifyCollectionChanged('image-tag')
        )
      : deserializeScene(new TextDecoder().decode(buffer));
    if (!scene) return false;
    this.state.loadScene(scene);
    return true;
  }

  /** Bakes the scene into a picture at a scale and keeps it in the room; throws where the room does not keep it. */
  async bake(scale: number): Promise<ImageFile> {
    const blob = await this.exportFn(this.state.current, STAMPS, {
      scale,
      drawGrid: false,
      resolveImageUrl: (id) => this.imageStorage.get(id)?.url ?? null,
    });
    const file = await this.imageStorage.addAsync(blob, { putBack: true });
    if (!file) throw new Error('the room removed the exported picture');
    return file;
  }

  /**
   * Brings the table that is out into the editor, once `confirm` agrees; false where there is no
   * table or the user declined.
   *
   * The floor arrives as a picture, since it was baked into one the moment it was laid down.
   * Everything else arrives as cells and comes under the editor from then on.
   */
  async bringInTable(confirm: () => Promise<boolean>): Promise<'done' | 'noTable' | 'declined'> {
    const snapshot = this.functionalPaint.snapshot();
    if (!snapshot) return 'noTable';
    if (!(await confirm())) return 'declined';
    this.state.loadScene(sceneFromTable(snapshot));
    return 'done';
  }

  /**
   * Lays what was painted on the table, and leaves the floor as it is.
   *
   * Baking the picture again to add a closed cell would cost the floor its quality and its
   * identity both, and neither has anything to do with what was painted.
   */
  applyFunctions(): FunctionApplyResult {
    const snapshot = this.functionalPaint.snapshot();
    if (!snapshot) return 'noTable';
    const plan = planFunctionPaint(this.state.current, snapshot);
    if (!plan) return 'gridMismatch';
    return this.functionalPaint.apply(plan) ? 'done' : 'noTable';
  }

  /**
   * Lays the scene on the table that is out: its picture as the floor, its size and grid, and what
   * was painted where it has something to say about the cells. Answers how laying what was painted
   * went, or null where there was nothing to lay; throws where the room does not keep the picture.
   */
  async layOnTable(scale: number): Promise<FunctionApplyResult | null> {
    const file = await this.bake(scale);
    const table = this.tabletopService.currentTable;
    const scene = this.state.current;
    table.imageIdentifier = file.identifier;
    table.width = scene.cols;
    table.height = scene.rows;
    table.gridSize = scene.cellPx;
    table.gridType = scene.gridType;
    // Only where the scene has something to say about the cells. A scene drawn from scratch
    // says nothing, and a plan built from nothing is a plan to take away every wall, mask and
    // no-entry cell the table already had.
    return sceneSpeaksFor(scene) ? this.applyFunctions() : null;
  }
}
