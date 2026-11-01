import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ImageService } from '@axe/application/storage/image.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { BoardSceneService } from '@axe/application/tabletop/board-scene.service';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { buildReorderContextMenu } from '@axe/application/ui/reorder-context-menu';
import { GameObject } from '@axe/core/sync/game-object';
import { normalizeFolderPath } from '@axe/domain/folder/folder-path';
import { withFolderInOrder } from '@axe/domain/folder/folder-tree';
import { Config } from '@axe/domain/peer/config';
import { BoardScene } from '@axe/domain/scene/board-scene';
import { type BoardScenePart, scenePartsOf, scenePictureIn } from '@axe/domain/scene/board-scene-parts';
import { buildSceneContextMenu } from '@axe/features/scene/scene-context-menu';
import { SceneEditorComponent } from '@axe/features/scene/scene-editor/scene-editor.component';
import { RowReorder } from '@axe/ui/dragging/row-reorder';
import { FolderShelf } from '@axe/ui/folder-tree/folder-shelf';
import { FolderTreeComponent } from '@axe/ui/folder-tree/folder-tree.component';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { TranslocoModule } from '@jsverse/transloco';

/** The mark each part of a scene is shown by in the list. */
export const SCENE_PART_ICONS: Readonly<Record<BoardScenePart, string>> = {
  table: 'table_view',
  floor: 'grid_on',
  background: 'landscape',
  walls: 'fence',
  foreground: 'filter_frames',
  weather: 'cloud',
  darkness: 'bedtime',
  fog: 'blur_on',
  bgm: 'music_note',
  bgs: 'graphic_eq',
  cutIn: 'slideshow',
  clock: 'schedule',
  text: 'chat',
  fade: 'gradient',
};

/** A scene as its row shows it. */
interface SceneRow {
  readonly name: string;
  readonly parts: readonly BoardScenePart[];
  /** The picture the row is shown with, the floor's, else the background's, else the one in front. */
  readonly thumbnail: string;
  /** Whether it is the scene the room was last put in. */
  readonly isCurrent: boolean;
}

/**
 * The room's scenes, filed in folders, to be put on with one press: each row the scene's picture,
 * its name and marks for the parts it changes, and below the list the scene picked, to be put
 * together part by part. A new scene is made from the table as it stands.
 *
 * Only the game master uses it.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-scene-panel',
  templateUrl: './scene-panel.component.html',
  imports: [FolderTreeComponent, SceneEditorComponent, SafePipe, TranslocoModule],
})
export class ScenePanelComponent {
  private readonly scenes = inject(BoardSceneService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly permission = inject(RolePermissionService);
  private readonly imageService = inject(ImageService);
  private readonly confirm = inject(ConfirmService);
  private readonly contextMenu = inject(ContextMenuService);
  private readonly pointer = inject(PointerDeviceService);
  private readonly modalService = inject(ModalService);
  private readonly panelService = inject(PanelService);
  private readonly t = inject(TRANSLATE_FN);

  protected readonly partIcons = SCENE_PART_ICONS;
  protected readonly canEdit = computed(() => this.permission.isGameMaster());

  /** The scene picked for putting together, by identifier. */
  protected readonly picked = signal<string | null>(null);
  /** The editor of the scene picked, whose words may still be waiting to be shared. */
  private readonly editor = viewChild(SceneEditorComponent);
  protected readonly reorder = new RowReorder<BoardScene>();

  protected readonly shelf = new FolderShelf<BoardScene>({
    items: () => BoardScene.all(),
    declared: () => Config.instance.boardSceneFolders,
    setDeclared: (paths) => {
      Config.instance.boardSceneFolders = paths;
      this.objectChange.notifyChanged(Config.instance.identifier);
    },
    canEdit: () => this.canEdit(),
    defaultFolderName: (index) => this.t('common.folder.defaultName', { index }),
    confirmDelete: (path, count) =>
      this.confirm.ask({
        message: this.t('common.folder.confirmDelete', { name: path, count }),
        okLabel: this.t('common.button.delete'),
        danger: true,
      }),
  });

  /** Every scene in the list order, each read again whenever it changes. */
  private readonly all = computed(() => {
    this.objectChange.collectionOf(BoardScene.aliasName)();
    const scenes = BoardScene.all();
    for (const scene of scenes) this.objectChange.versionOf(scene.identifier)();
    return scenes;
  });

  private readonly rows = computed<ReadonlyMap<string, SceneRow>>(() => {
    this.objectChange.versionOf(Config.instance.identifier)();
    this.objectChange.fileVersion();
    const current = Config.instance.boardScene;
    return new Map(
      this.all().map((scene) => [
        scene.identifier,
        {
          name: scene.name.trim() || this.t('feature.scene.untitled'),
          parts: scenePartsOf(scene),
          thumbnail: this.thumbnailOf(scene),
          isCurrent: scene.identifier === current,
        },
      ])
    );
  });

  protected readonly tree = computed(() => {
    this.objectChange.versionOf(Config.instance.identifier)();
    return this.shelf.tree(this.all());
  });

  protected readonly isEmpty = computed(() => this.all().length < 1 && this.tree().roots.length < 1);

  protected readonly pickedScene = computed(() => {
    const identifier = this.picked();
    const scene = identifier ? this.all().find((candidate) => candidate.identifier === identifier) : undefined;
    return scene ?? null;
  });

  constructor() {
    queueMicrotask(() => (this.modalService.title = this.panelService.title = this.t('feature.scene.title')));
  }

  protected rowOf(scene: BoardScene): SceneRow {
    return this.rows().get(scene.identifier) ?? { name: scene.name, parts: [], thumbnail: '', isCurrent: false };
  }

  /** Makes a scene from the table as it stands, numbered after the others, and picks it. */
  protected create(): void {
    const scene = this.scenes.create(this.t('feature.scene.defaultName', { index: this.all().length + 1 }));
    if (scene) this.picked.set(scene.identifier);
  }

  protected createFolder(): void {
    this.shelf.createFolder();
  }

  protected pick(scene: BoardScene): void {
    this.picked.set(scene.identifier);
  }

  protected apply(scene: BoardScene, options: { bgm?: boolean; text?: boolean } = {}): void {
    this.editor()?.flushText();
    this.scenes.apply(scene, options);
  }

  /** Writes the table as it stands over a scene, once the reader has said they mean it. */
  protected async overwrite(scene: BoardScene): Promise<void> {
    if (!this.canEdit()) return;
    const sure = await this.confirm.ask({
      message: this.t('feature.scene.overwriteConfirm', { name: this.rowOf(scene).name }),
      okLabel: this.t('feature.scene.menu.overwrite'),
    });
    this.editor()?.flushText();
    if (sure) this.scenes.overwrite(scene);
  }

  protected openMenu(event: MouseEvent, scene: BoardScene): void {
    if (!this.canEdit()) return;
    event.preventDefault();
    event.stopPropagation();
    const row = this.rowOf(scene);
    const siblings = this.siblingsOf(scene);
    const index = siblings.indexOf(scene);
    const reorder = buildReorderContextMenu(
      { index, count: siblings.length },
      {
        moveToTop: () => this.moveWithin(scene, 0),
        moveUp: () => this.moveWithin(scene, index - 1),
        moveDown: () => this.moveWithin(scene, index + 1),
        moveToBottom: () => this.moveWithin(scene, siblings.length - 1),
      },
      this.t
    );
    const actions = buildSceneContextMenu(
      {
        folderName: normalizeFolderPath(scene.folderName),
        hasMusic: row.parts.includes('bgm'),
        hasText: row.parts.includes('text'),
      },
      this.shelf.knownPaths(),
      reorder,
      {
        applyWithoutBgm: () => this.apply(scene, { bgm: false }),
        applyWithoutText: () => this.apply(scene, { text: false }),
        edit: () => this.pick(scene),
        overwrite: () => void this.overwrite(scene),
        duplicate: () => this.duplicate(scene),
        moveTo: (path) => this.shelf.fileInto([scene], path),
        remove: () => void this.remove(scene),
      },
      this.t
    );
    this.contextMenu.open(this.pointer.pointers[0], actions, row.name);
  }

  protected duplicate(scene: BoardScene): void {
    this.editor()?.flushText();
    const copy = this.scenes.duplicate(scene, this.t('feature.scene.copyName', { name: this.rowOf(scene).name }));
    if (copy) this.picked.set(copy.identifier);
  }

  /** Deletes a scene for everyone, once the reader has said they mean it. */
  protected async remove(scene: BoardScene): Promise<void> {
    if (!this.canEdit()) return;
    const sure = await this.confirm.ask({
      message: this.t('feature.scene.deleteConfirm', { name: this.rowOf(scene).name }),
      okLabel: this.t('common.button.delete'),
      danger: true,
    });
    if (!sure || !this.canEdit()) return;
    if (this.picked() === scene.identifier) this.picked.set(null);
    scene.destroy();
  }

  protected dragStart(event: DragEvent, scene: BoardScene): void {
    if (!this.canEdit()) return;
    event.dataTransfer?.setData('text/plain', scene.name);
    this.reorder.begin(scene);
  }

  protected dragOver(event: DragEvent, scene: BoardScene): void {
    if (this.reorder.held() === null) return;
    event.preventDefault();
    const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.reorder.hoverHalf(scene, bounds, event.clientY);
  }

  /** A scene dropped on another goes into that one's folder, before or after it. */
  protected dropOnRow(event: DragEvent): void {
    const dropped = this.reorder.release();
    if (!dropped) return;
    event.preventDefault();
    event.stopPropagation();
    const { held, over, side } = dropped;
    this.shelf.fileInto([held], over.folderName);
    const siblings = this.siblingsOf(held).filter((scene) => scene !== held);
    const at = siblings.indexOf(over) + (side === 'after' ? 1 : 0);
    siblings.splice(at, 0, held);
    this.putInOrder(held, siblings);
  }

  /** A scene dropped on a folder goes into it, last. */
  protected dropIntoFolder(path: string): void {
    const held = this.reorder.held();
    this.reorder.cancel();
    if (!held) return;
    this.shelf.fileInto([held], path);
    this.putInOrder(held, [...this.siblingsOf(held).filter((scene) => scene !== held), held]);
  }

  protected dragEnd(): void {
    this.reorder.cancel();
  }

  protected isDropTarget(scene: BoardScene): boolean {
    return this.reorder.over() === scene;
  }

  /** The scenes in the same folder as this one, in the list order, itself among them. */
  private siblingsOf(scene: BoardScene): BoardScene[] {
    const folder = normalizeFolderPath(scene.folderName);
    return BoardScene.all().filter((candidate) => normalizeFolderPath(candidate.folderName) === folder);
  }

  private moveWithin(scene: BoardScene, to: number): void {
    const siblings = this.siblingsOf(scene).filter((candidate) => candidate !== scene);
    siblings.splice(Math.max(0, Math.min(siblings.length, to)), 0, scene);
    this.putInOrder(scene, siblings);
  }

  /**
   * Puts the scenes of one folder in the order given, the rest of the list left where it stands:
   * the whole list is numbered afresh with the folder's scenes in the places they held together.
   */
  private putInOrder(moved: BoardScene, ordered: readonly BoardScene[]): void {
    if (!this.canEdit()) return;
    const folder = normalizeFolderPath(moved.folderName);
    const list = withFolderInOrder(BoardScene.all(), (scene) => scene.folderName, folder, ordered);
    GameObject.batch(() => {
      list.forEach((scene, index) => {
        if (Number(scene.order) !== index + 1) scene.order = index + 1;
      });
    });
  }

  private thumbnailOf(scene: BoardScene): string {
    for (const field of ['floorImageIdentifier', 'backgroundImageIdentifier', 'foregroundImageIdentifier'] as const) {
      const picture = scenePictureIn(scene[field]);
      if (!picture) continue;
      const image = this.imageService.getEmptyOr(picture);
      if (!image.isEmpty) return image.thumbnail?.url || image.url;
    }
    return '';
  }
}
