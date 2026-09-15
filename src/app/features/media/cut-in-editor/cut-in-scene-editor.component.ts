import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { type CutInSoundHandle, CutInSoundService } from '@axe/application/media/cut-in-sound.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { EditHistory } from '@axe/core/util/edit-history';
import { CutIn } from '@axe/domain/media/cut-in';
import { KEY_TOLERANCE_MS } from '@axe/domain/media/cut-in-keyframe';
import { CutInLayer, type CutInLayerKind } from '@axe/domain/media/cut-in-layer';
import { CutInScene } from '@axe/domain/media/cut-in-scene';
import {
  cloneSceneSnapshot,
  type CutInSceneSnapshot,
  restoreScene,
  snapshotScene,
} from '@axe/domain/media/cut-in-scene-snapshot';
import { sceneDurationOf } from '@axe/domain/media/cut-in-scene-timeline';
import {
  DEFAULT_SOUND_VOLUME,
  encodeCutInSounds,
  moveSound,
  removeSoundAt,
  soundIndexAt,
  upsertSound,
} from '@axe/domain/media/cut-in-sound';
import { CutInBgmComponent } from '@axe/features/media/cut-in-bgm/cut-in-bgm.component';
import {
  addLayer,
  duplicateLayer,
  ensureScene,
  removeLayer,
  reorderLayers,
} from '@axe/features/media/cut-in-editor/cut-in-editor-ops';
import {
  type CutInEditorCommand,
  cutInEditorKeyDown,
  isTypingTarget,
} from '@axe/features/media/cut-in-editor/cut-in-editor-shortcut';
import {
  moveLayerKeys,
  removeLayerKeys,
  setValueAt,
  valueAt,
} from '@axe/features/media/cut-in-editor/cut-in-keyframe-edit';
import {
  type CutInPose,
  layerKeyTimes,
  pastePoseAt,
  poseAt,
} from '@axe/features/media/cut-in-editor/cut-in-keyframe-edit';
import { CutInLayerListComponent } from '@axe/features/media/cut-in-editor/cut-in-layer-list.component';
import { CutInLayerPropertiesComponent } from '@axe/features/media/cut-in-editor/cut-in-layer-properties.component';
import {
  angleFromCentre,
  applyResize,
  clampStageZoom,
  fromLayerLocal,
  isInsideLayer,
  isOnRotateHandle,
  type LayerBox,
  type LayerTransform,
  MAX_STAGE_ZOOM,
  MIN_STAGE_ZOOM,
  normaliseAngle,
  type ResizeHandle,
  resizeHandleAt,
  rotateGripAt,
  STAGE_ZOOM_STEP,
  stageDeltaToScene,
  stageFit,
  stageToScene,
  toLayerLocal,
  toLayerLocalDelta,
} from '@axe/features/media/cut-in-editor/cut-in-stage-geometry';
import { CutInTimelineComponent } from '@axe/features/media/cut-in-editor/cut-in-timeline.component';
import {
  clampZoom,
  formatMs,
  keyBeyond,
  MAX_TIMELINE_ZOOM,
  MIN_TIMELINE_ZOOM,
  pxPerSecFor,
  scrollToHold,
  SNAP_MS,
  TIMELINE_HEAD_OFFSET_PX,
  TIMELINE_HEAD_W_PX,
  TIMELINE_ZOOM_STEP,
  trackWidthFor,
  xToMs,
} from '@axe/features/media/cut-in-editor/cut-in-timeline-geometry';
import { CutInStageComponent } from '@axe/features/media/cut-in-stage/cut-in-stage.component';
import type { DropSide } from '@axe/ui/dragging/row-reorder';
import { TranslocoModule } from '@jsverse/transloco';

/** How often a drag reaches the model, which is how often it reaches everyone else. */
const DRAG_FLUSH_MS = 66;

interface Drag {
  layer: CutInLayer;
  handle: ResizeHandle | null;
  /** Set while the grip above the box is being dragged round. */
  turningFrom: number | null;
  fromX: number;
  fromY: number;
  box: LayerBox;
  transform: LayerTransform;
  rotation: number;
}

/**
 * Building a cut-in out of layers.
 *
 * The stage shows the same component the playing window uses, with the picking and the
 * handles laid over it. A drag writes to the model on a timer rather than on every
 * move, the way a piece being pushed around the table does, so a drag does not put sixty
 * messages a second onto the wire.
 */
/** How far one press of an arrow moves the playhead: the same grid a moment is rounded to. */
const STEP_MS = SNAP_MS;

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'cut-in-scene-editor',
  templateUrl: './cut-in-scene-editor.component.html',
  host: { class: 'block' },
  imports: [
    FormsModule,
    TranslocoModule,
    CutInStageComponent,
    CutInLayerListComponent,
    CutInLayerPropertiesComponent,
    CutInTimelineComponent,
  ],
})
export class CutInSceneEditorComponent {
  private readonly objectChange = inject(ObjectChangeService);
  private readonly cutInSound = inject(CutInSoundService);
  private readonly modalService = inject(ModalService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly t = inject(TRANSLATE_FN);

  readonly cutIn = input<CutIn | null>(null);
  readonly isEditable = input(false);

  private readonly stageArea = viewChild<ElementRef<HTMLElement>>('stageArea');
  private readonly timelineArea = viewChild<ElementRef<HTMLElement>>('timelineArea');

  protected readonly selectedIdentifier = signal<string>('');
  protected readonly playing = signal(false);
  protected readonly playheadMs = signal(0);

  /** The heads beside the timeline start below its ruler and its sound row. */
  protected readonly timelineHeadOffsetPx = TIMELINE_HEAD_OFFSET_PX;
  protected readonly timelineHeadWidthPx = TIMELINE_HEAD_W_PX;

  /**
   * How far the timeline is drawn out, and the room the bands have to be drawn out in.
   *
   * Fitted to the panel a tenth of a second comes to a few pixels, which is no use for
   * putting a key where it is meant to go.
   */
  protected readonly timelineZoom = signal(MIN_TIMELINE_ZOOM);
  private readonly timelineRoomPx = signal(0);
  protected readonly timelineViewportPx = computed(() => Math.max(1, this.timelineRoomPx() - TIMELINE_HEAD_W_PX));
  protected readonly zoomPercent = computed(() => Math.round(this.timelineZoom() * 100));
  protected readonly canZoomIn = computed(() => this.timelineZoom() < MAX_TIMELINE_ZOOM);
  protected readonly canZoomOut = computed(() => this.timelineZoom() > MIN_TIMELINE_ZOOM);
  protected readonly clock = computed(() => formatMs(this.durationMs()));
  protected readonly playheadSeconds = computed(() => Math.round(this.playheadMs()) / 1000);

  /** A moment typed rather than dragged at, which is the only way to hit an exact one. */
  protected onSeekSeconds(event: Event): void {
    const seconds = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(seconds)) return;
    this.pause();
    this.onSeek(Math.min(this.durationMs(), Math.max(0, Math.round(seconds * 1000))));
  }
  private readonly stageSize = signal({ width: 0, height: 0 });
  private readonly bumped = signal(0);

  private drag: Drag | null = null;
  /** The preview's own scene sounds, which a cut-in playing in the room knows nothing about. */
  private sceneSound: CutInSoundHandle | null = null;
  private clockId: number | null = null;
  private history: EditHistory<CutInSceneSnapshot> | null = null;
  private historyOf = '';
  protected readonly historyVersion = signal(0);
  private pending: { layer: CutInLayer; box: LayerBox | null; rotation: number | null } | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  readonly scene = computed<CutInScene | null>(() => {
    const cutIn = this.cutIn();
    if (!cutIn) return null;
    this.objectChange.collectionOf(CutInScene.aliasName)();
    this.bumped();
    return cutIn.scene;
  });

  readonly layers = computed<CutInLayer[]>(() => {
    const scene = this.scene();
    if (!scene) return [];
    this.objectChange.versionOf(scene.identifier)();
    this.objectChange.collectionOf(CutInLayer.aliasName)();
    this.bumped();
    return scene.layers;
  });

  readonly sounds = computed(() => {
    const scene = this.scene();
    if (!scene) return [];
    this.objectChange.versionOf(scene.identifier)();
    this.bumped();
    return scene.soundList;
  });

  readonly selected = computed<CutInLayer | null>(() => {
    const identifier = this.selectedIdentifier();
    return this.layers().find((layer) => layer.identifier === identifier) ?? null;
  });

  /**
   * Whether the layer in hand has a key at the playhead that may be taken away, for the button
   * that does it. A locked layer's keys stay where they are, as they do on the timeline.
   */
  protected readonly canRemoveKeysAtPlayhead = computed(() => {
    const layer = this.selected();
    if (!layer) return false;
    this.objectChange.versionOf(layer.identifier)();
    this.bumped();
    if (layer.locked) return false;
    const ms = this.playheadMs();
    return layerKeyTimes(layer).some((time) => Math.abs(time - ms) <= KEY_TOLERANCE_MS);
  });

  /** Whether a sound stands at the playhead, for the button that takes it away. */
  protected readonly hasSoundAtPlayhead = computed(() => soundIndexAt(this.sounds(), this.playheadMs()) >= 0);

  readonly sceneWidth = computed(() => this.watchCutIn()?.width ?? 0);
  readonly sceneHeight = computed(() => this.watchCutIn()?.height ?? 0);

  readonly durationMs = computed(() => {
    const scene = this.scene();
    if (!scene) return 0;
    this.objectChange.versionOf(scene.identifier)();
    for (const layer of this.layers()) this.objectChange.versionOf(layer.identifier)();
    return sceneDurationOf(scene);
  });

  /** Where the scene sits inside the room the stage has, so a pointer can be read back. */
  /** How far the stage is leaned into, past the scale that fits the cut-in in. */
  protected readonly stageZoom = signal(MIN_STAGE_ZOOM);
  protected readonly stagePercent = computed(() => Math.round(this.stageZoom() * 100));
  protected readonly canStageZoomIn = computed(() => this.stageZoom() < MAX_STAGE_ZOOM);
  protected readonly canStageZoomOut = computed(() => this.stageZoom() > MIN_STAGE_ZOOM);

  readonly fit = computed(() =>
    stageFit({ width: this.sceneWidth(), height: this.sceneHeight() }, this.stageSize(), this.stageZoom())
  );

  protected stageZoomIn(): void {
    this.stageZoom.set(clampStageZoom(this.stageZoom() * STAGE_ZOOM_STEP));
  }

  protected stageZoomOut(): void {
    this.stageZoom.set(clampStageZoom(this.stageZoom() / STAGE_ZOOM_STEP));
  }

  protected stageZoomToFit(): void {
    this.stageZoom.set(MIN_STAGE_ZOOM);
  }

  protected onStageWheel(event: WheelEvent): void {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    if (event.deltaY < 0) this.stageZoomIn();
    else this.stageZoomOut();
  }

  readonly selectionBox = computed<LayerBox | null>(() => {
    const layer = this.selected();
    if (!layer) return null;
    this.objectChange.versionOf(layer.identifier)();
    this.bumped();
    return this.boxOf(layer);
  });

  /** How the selected layer is turned and grown, so the outline sits on it rather than beside it. */
  readonly selectionTransform = computed(() => {
    const layer = this.selected();
    if (!layer) return 'none';
    this.objectChange.versionOf(layer.identifier)();
    this.bumped();

    const transform = this.transformOf(layer);
    const lean =
      transform.skewXDeg !== 0 || transform.skewYDeg !== 0
        ? ` skew(${transform.skewXDeg}deg, ${transform.skewYDeg}deg)`
        : '';
    return `rotate(${transform.rotationDeg}deg) scale(${transform.scaleX}, ${transform.scaleY})${lean}`;
  });

  /**
   * Where the grip that turns the layer is drawn.
   *
   * It is placed on the stage rather than inside the outline, so that turning and growing
   * the layer move it without also stretching it. Where it is drawn is then exactly where
   * the pointer is looked for.
   */
  readonly rotateGrip = computed<{ left: number; top: number } | null>(() => {
    const layer = this.selected();
    const box = this.selectionBox();
    if (!layer || !box) return null;

    const fit = this.fit();
    const transform = this.transformOf(layer);
    const drawn = fromLayerLocal(rotateGripAt(box, fit, transform), box, transform);
    return { left: fit.offsetX + drawn.x * fit.scale, top: fit.offsetY + drawn.y * fit.scale };
  });

  readonly selectionOrigin = computed(() => {
    const layer = this.selected();
    if (!layer) return '50% 50%';
    return `${layer.anchorX * 100}% ${layer.anchorY * 100}%`;
  });

  constructor() {
    // The stack is started from the scene as it stands, before anything is changed, so the
    // very first change has something to be taken back to.
    effect(() => {
      const cutIn = this.cutIn();
      this.historyOf = cutIn?.identifier ?? '';
      this.history = cutIn ? new EditHistory(snapshotScene(cutIn.scene), cloneSceneSnapshot) : null;
      this.selectedIdentifier.set('');
      this.historyVersion.update((count) => count + 1);
    });

    afterNextRender(() => {
      this.watchStageSize();
      this.watchTimelineRoom();
    });
    this.destroyRef.onDestroy(() => {
      this.flushDrag();
      this.pause();
    });
  }

  protected addImageLayer(): void {
    this.addLayerOfKind('image', 'newImageLayer');
  }

  protected addTextLayer(): void {
    this.addLayerOfKind('text', 'newTextLayer');
  }

  protected addFillLayer(): void {
    this.addLayerOfKind('fill', 'newFillLayer');
  }

  private addLayerOfKind(kind: CutInLayerKind, nameKey: string): void {
    const cutIn = this.cutIn();
    if (!cutIn || !this.isEditable()) return;

    const scene = ensureScene(cutIn);
    const layer = addLayer(scene, kind, this.t(`feature.media.cutInEditor.${nameKey}`), {
      width: cutIn.width,
      height: cutIn.height,
    });
    // A cut-in built out of layers is no longer the size of one picture.
    cutIn.originalSize = false;
    this.selectedIdentifier.set(layer.identifier);
    this.changed();
  }

  protected duplicateSelected(): void {
    const scene = this.scene();
    const layer = this.selected();
    if (!scene || !layer || !this.isEditable()) return;

    const copy = duplicateLayer(scene, layer);
    if (copy) this.selectedIdentifier.set(copy.identifier);
    this.changed();
  }

  protected removeSelected(): void {
    const scene = this.scene();
    const layer = this.selected();
    if (!scene || !layer || !this.isEditable()) return;

    removeLayer(scene, layer);
    this.selectedIdentifier.set('');
    this.changed();
  }

  protected onSelect(layer: CutInLayer): void {
    this.selectedIdentifier.set(layer.identifier);
  }

  protected onToggleHidden(layer: CutInLayer): void {
    if (!this.isEditable()) return;
    layer.hidden = !layer.hidden;
    this.changed();
  }

  protected onToggleLocked(layer: CutInLayer): void {
    if (!this.isEditable()) return;
    layer.locked = !layer.locked;
    this.changed();
  }

  protected onReorder(dropped: { held: CutInLayer; over: CutInLayer; side: DropSide | null }): void {
    const scene = this.scene();
    if (!scene || !this.isEditable()) return;

    reorderLayers(scene, dropped.held, dropped.over, dropped.side);
    this.changed();
  }

  protected onPointerDown(event: PointerEvent): void {
    if (!this.isEditable()) return;

    const point = this.pointAt(event);
    const layer = this.layerAt(point);
    if (!layer) {
      this.selectedIdentifier.set('');
      return;
    }

    this.selectedIdentifier.set(layer.identifier);
    (event.target as HTMLElement | null)?.setPointerCapture?.(event.pointerId);

    const box = this.boxOf(layer);
    const transform = this.transformOf(layer);
    const local = toLayerLocal(point, box, transform);
    const turning = isOnRotateHandle(local, box, this.fit(), undefined, transform);

    this.drag = {
      layer,
      handle: turning ? null : resizeHandleAt(local, box, this.fit(), undefined, transform),
      // The angle is read in the stage's own frame, which is the frame the pointer travels in.
      turningFrom: turning ? angleFromCentre(point, box, transform) : null,
      fromX: event.clientX,
      fromY: event.clientY,
      box,
      transform,
      rotation: transform.rotationDeg,
    };
  }

  protected onPointerMove(event: PointerEvent): void {
    if (!this.drag) return;

    // A pointer that has already been let go of, or one taken away by something the
    // browser started, leaves no release behind. Anything still held then would follow
    // the pointer about for good, so the drag is closed off the moment that shows.
    if (event.buttons === 0) {
      this.finishDrag();
      return;
    }

    this.applyMove(event);
  }

  private applyMove(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag) return;

    if (drag.turningFrom !== null) {
      const turned = angleFromCentre(this.pointAt(event), drag.box, drag.transform) - drag.turningFrom;
      // Holding shift snaps to the eighths of a turn, for a level or a quarter-turned layer.
      this.queueTurn(drag.layer, normaliseAngle(drag.rotation + turned, event.shiftKey ? 45 : 0));
      return;
    }

    const moved = stageDeltaToScene(event.clientX - drag.fromX, event.clientY - drag.fromY, this.fit());
    // Moving happens in the stage's frame; resizing happens along the layer's own edges.
    const alongEdges = toLayerLocalDelta(moved, drag.transform);
    const box = drag.handle
      ? applyResize(drag.box, drag.handle, alongEdges.x, alongEdges.y, event.shiftKey)
      : { ...drag.box, x: drag.box.x + moved.x, y: drag.box.y + moved.y };

    this.queueFlush(drag.layer, box);
  }

  protected onPointerUp(event: PointerEvent): void {
    if (!this.drag) return;
    (event.target as HTMLElement | null)?.releasePointerCapture?.(event.pointerId);

    if (event.type === 'pointerup') this.applyMove(event);
    this.finishDrag();
  }

  /** Writes down where the drag got to and lets go of it. */
  private finishDrag(): void {
    if (!this.drag) return;

    this.drag = null;
    this.flushDrag();
    this.changed();
  }

  protected togglePlaying(): void {
    if (this.playing()) {
      this.pause();
      return;
    }
    this.start();
  }

  protected stop(): void {
    this.pause();
    this.playheadMs.set(0);
  }

  /**
   * A key or a sound tapped on the timeline. The playhead goes onto it while the preview is
   * stopped, where the buttons that take one away act; a playing preview is left to play on.
   */
  protected onCue(ms: number): void {
    if (!this.playing()) this.playheadMs.set(ms);
  }

  protected onSeek(ms: number): void {
    this.pause();
    this.playheadMs.set(ms);
  }

  protected onMoveKey(moved: { layer: CutInLayer; fromMs: number; toMs: number }): void {
    if (!this.isEditable()) return;
    if (moveLayerKeys(moved.layer, moved.fromMs, moved.toMs)) this.changed();
  }

  /** Takes away every key a layer has at a moment, unless the layer is locked. */
  protected onRemoveKey(removed: { layer: CutInLayer; ms: number }): void {
    if (!this.isEditable() || removed.layer.locked) return;
    if (removeLayerKeys(removed.layer, removed.ms)) this.changed();
  }

  /**
   * Takes away every key the layer in hand has at the playhead, as a double click on the
   * timeline does; a touch screen has no double click, so a tap on a key and this button stand in.
   */
  protected removeKeysAtPlayhead(): void {
    const layer = this.selected();
    if (layer) this.onRemoveKey({ layer, ms: this.playheadMs() });
  }

  /** Takes away the sound at the playhead, as a double click on its mark does. */
  protected removeSoundAtPlayhead(): void {
    this.onRemoveSound({ ms: this.playheadMs() });
  }

  protected onMoveSound(moved: { fromMs: number; toMs: number }): void {
    const scene = this.scene();
    if (!scene || !this.isEditable()) return;

    scene.sounds = encodeCutInSounds(moveSound(scene.soundList, moved.fromMs, moved.toMs));
    this.changed();
  }

  /** How long a layer is on screen for, set by dragging the ends of its band. */
  protected onTrimLayer(trimmed: { layer: CutInLayer; startMs: number; endMs: number }): void {
    if (!this.isEditable() || trimmed.layer.locked) return;
    trimmed.layer.startMs = trimmed.startMs;
    trimmed.layer.endMs = trimmed.endMs;
  }

  protected onTrimmed(): void {
    this.changed();
  }

  protected onRemoveSound(removed: { ms: number }): void {
    const scene = this.scene();
    if (!scene || !this.isEditable()) return;

    scene.sounds = encodeCutInSounds(removeSoundAt(scene.soundList, removed.ms));
    this.changed();
  }

  /** Drops a sound at the scrubber, chosen from what the room has. */
  protected addSound(): void {
    const cutIn = this.cutIn();
    if (!cutIn || !this.isEditable()) return;

    this.modalService.open<string>(CutInBgmComponent).then((identifier) => {
      if (!identifier) return;

      const scene = ensureScene(cutIn);
      scene.sounds = encodeCutInSounds(
        upsertSound(scene.soundList, { t: this.playheadMs(), a: identifier, v: DEFAULT_SOUND_VOLUME })
      );
      this.changed();
    });
  }

  /**
   * The editor runs the clock itself rather than letting the animations run.
   *
   * Holding every layer at the moment the scrubber names is the only way the picture and
   * the playhead can be trusted to agree, which is what an editor is for.
   */
  private start(): void {
    const durationMs = this.durationMs();
    if (durationMs < 1) return;

    this.playing.set(true);
    const from = this.playheadMs() >= durationMs ? 0 : this.playheadMs();
    const startedAt = performance.now() - from;
    this.sceneSound?.stop();
    this.sceneSound = this.cutInSound.play(this.scene(), from, this.sceneLoop);

    const step = () => {
      if (!this.playing()) return;
      const running = Math.max(1, this.durationMs());
      const at = performance.now() - startedAt;

      if (at < running) {
        this.playheadMs.set(at);
      } else if (this.sceneLoop) {
        this.playheadMs.set(at % running);
      } else {
        this.playheadMs.set(running);
        this.pause();
        return;
      }
      this.clockId = requestAnimationFrame(step);
    };
    this.clockId = requestAnimationFrame(step);
  }

  private pause(): void {
    this.playing.set(false);
    this.sceneSound?.stop();
    this.sceneSound = null;
    if (this.clockId !== null) {
      cancelAnimationFrame(this.clockId);
      this.clockId = null;
    }
  }

  protected get sceneDurationSeconds(): number {
    return Math.round(this.durationMs() / 100) / 10;
  }
  protected set sceneDurationSeconds(seconds: number) {
    const scene = this.scene();
    if (!scene || !this.isEditable()) return;
    scene.durationMs = Math.max(100, Math.round((Number(seconds) || 0) * 1000));
    this.changed();
  }

  protected get sceneLoop(): boolean {
    return this.scene()?.sceneLoop ?? false;
  }
  protected set sceneLoop(sceneLoop: boolean) {
    const scene = this.scene();
    if (!scene || !this.isEditable()) return;
    scene.sceneLoop = sceneLoop;
    this.changed();
  }

  /** Something changed: what reads from the model is redrawn, and the change can be taken back. */
  protected changed(): void {
    this.bumped.update((count) => count + 1);
    this.stack()?.commit(snapshotScene(this.scene()));
    this.historyVersion.update((count) => count + 1);
  }

  protected canUndo(): boolean {
    this.historyVersion();
    return this.stack()?.canUndo() ?? false;
  }

  protected canRedo(): boolean {
    this.historyVersion();
    return this.stack()?.canRedo() ?? false;
  }

  protected undo(): void {
    this.stepHistory((stack) => stack.undo());
  }

  protected redo(): void {
    this.stepHistory((stack) => stack.redo());
  }

  protected onKeyDown(event: KeyboardEvent): void {
    const action = cutInEditorKeyDown(event.key, {
      typing: isTypingTarget(event.target),
      chord: event.ctrlKey || event.metaKey,
      shift: event.shiftKey,
      alt: event.altKey,
      hasSelection: this.selected() !== null,
    });
    if (!action) return;
    if (action.preventDefault) event.preventDefault();

    if (action.command === 'nudge') {
      this.nudgeSelected(action.dx ?? 0, action.dy ?? 0);
      return;
    }
    this.run(action.command);
  }

  private run(command: CutInEditorCommand): void {
    if (command === 'undo') this.undo();
    else if (command === 'redo') this.redo();
    else if (command === 'deleteSelection') this.removeSelected();
    else if (command === 'togglePlaying') this.togglePlaying();
    else if (command === 'stepBack') this.stepBy(-STEP_MS);
    else if (command === 'stepForward') this.stepBy(STEP_MS);
    else if (command === 'jumpBack') this.jumpToKey(false);
    else if (command === 'jumpForward') this.jumpToKey(true);
    else if (command === 'toStart') this.onSeek(0);
    else if (command === 'toEnd') this.onSeek(this.durationMs());
    else if (command === 'copyPose') this.copyPose();
    else if (command === 'pastePose') this.pastePose();
  }

  /**
   * The moment the layer in hand is holding, kept until it is laid down somewhere else.
   *
   * It lives for as long as the editor is open rather than going near the system clipboard,
   * which holds text and would have nowhere to put nine numbers a reader could use.
   */
  private held: CutInPose | null = null;

  /**
   * Moves the layer in hand by a pixel or ten, in the cut-in's own coordinates.
   *
   * Where the layer is keyed at the playhead, the key is what moves; where it is not, the
   * layer's own place does, which is the same rule every field in the properties panel goes by.
   */
  protected nudgeSelected(dx: number, dy: number): void {
    const layer = this.selected();
    if (!layer || !this.isEditable() || layer.locked) return;

    const ms = this.playheadMs();
    if (dx !== 0) setValueAt(layer, 'x', ms, valueAt(layer, 'x', ms) + dx);
    if (dy !== 0) setValueAt(layer, 'y', ms, valueAt(layer, 'y', ms) + dy);
    this.changed();
  }

  protected copyPose(): void {
    const layer = this.selected();
    if (!layer) return;
    this.held = poseAt(layer, this.playheadMs());
  }

  protected pastePose(): void {
    const layer = this.selected();
    const pose = this.held;
    if (!layer || !pose || !this.isEditable() || layer.locked) return;
    if (!pastePoseAt(layer, pose, this.playheadMs())) return;
    this.changed();
  }

  protected get hasHeldPose(): boolean {
    return this.held !== null;
  }

  /** A step along the scene, no smaller than what a moment is rounded to. */
  protected stepBy(deltaMs: number): void {
    this.pause();
    this.onSeek(Math.min(this.durationMs(), Math.max(0, this.playheadMs() + deltaMs)));
  }

  /**
   * To the next moment something happens at, rather than to the next tick of the clock.
   *
   * The keys of the layer in hand where there is one, and of the whole scene where there
   * is not, so that the playhead lands where there is something to see either way.
   */
  protected jumpToKey(forward: boolean): void {
    const chosen = this.selected();
    const layers = chosen ? [chosen] : this.layers();
    const times = new Set<number>();
    for (const layer of layers) for (const ms of layerKeyTimes(layer)) times.add(ms);
    for (const sound of this.sounds()) times.add(sound.t);
    times.add(0);
    times.add(this.durationMs());

    const landed = keyBeyond([...times], this.playheadMs(), forward);
    if (landed === null) return;
    this.pause();
    this.onSeek(landed);
  }

  protected get canJumpBack(): boolean {
    return this.playheadMs() > 0;
  }

  private stepHistory(step: (stack: EditHistory<CutInSceneSnapshot>) => CutInSceneSnapshot | null): void {
    const stack = this.stack();
    const scene = this.scene();
    if (!stack || !scene || !this.isEditable()) return;

    const wanted = step(stack);
    if (!wanted) return;

    restoreScene(scene, wanted);
    this.bumped.update((count) => count + 1);
    this.historyVersion.update((count) => count + 1);
    if (!this.layers().some((layer) => layer.identifier === this.selectedIdentifier())) {
      this.selectedIdentifier.set('');
    }
  }

  /** The stack for the cut-in being edited. */
  private stack(): EditHistory<CutInSceneSnapshot> | null {
    return this.historyOf === (this.cutIn()?.identifier ?? '') ? this.history : null;
  }

  private watchCutIn(): CutIn | null {
    const cutIn = this.cutIn();
    if (cutIn) this.objectChange.versionOf(cutIn.identifier)();
    return cutIn;
  }

  private pointAt(event: PointerEvent): { x: number; y: number } {
    const bounds = this.stageArea()?.nativeElement.getBoundingClientRect();
    if (!bounds) return { x: 0, y: 0 };
    return stageToScene(event.clientX - bounds.left, event.clientY - bounds.top, this.fit());
  }

  /** Where a layer stands at the scrubber, which is where it is grabbed. */
  private boxOf(layer: CutInLayer): LayerBox {
    const ms = this.playheadMs();
    return {
      x: valueAt(layer, 'x', ms),
      y: valueAt(layer, 'y', ms),
      width: layer.width,
      height: layer.height,
    };
  }

  /** How a layer is turned and grown at the scrubber, which is how it is drawn. */
  private transformOf(layer: CutInLayer): LayerTransform {
    const ms = this.playheadMs();
    return {
      rotationDeg: valueAt(layer, 'rotation', ms),
      scaleX: valueAt(layer, 'scaleX', ms),
      scaleY: valueAt(layer, 'scaleY', ms),
      skewXDeg: layer.skewXDeg,
      skewYDeg: layer.skewYDeg,
      anchorX: layer.anchorX,
      anchorY: layer.anchorY,
    };
  }

  /** The topmost layer under the pointer, which is the last one drawn. */
  private layerAt(point: { x: number; y: number }): CutInLayer | null {
    const layers = this.layers();
    for (let at = layers.length - 1; at >= 0; at--) {
      const layer = layers[at];
      if (layer.hidden || layer.locked) continue;

      const box = this.boxOf(layer);
      const transform = this.transformOf(layer);
      const local = toLayerLocal(point, box, transform);

      if (isOnRotateHandle(local, box, this.fit(), undefined, transform)) return layer;
      if (resizeHandleAt(local, box, this.fit(), undefined, transform) || isInsideLayer(local, box)) return layer;
    }
    return null;
  }

  private queueTurn(layer: CutInLayer, rotation: number): void {
    this.pending = { layer, box: null, rotation };
    this.startFlushTimer();
  }

  private queueFlush(layer: CutInLayer, box: LayerBox): void {
    this.pending = { layer, box, rotation: null };
    this.startFlushTimer();
  }

  private startFlushTimer(): void {
    if (this.flushTimer !== null) return;

    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flushDrag();
    }, DRAG_FLUSH_MS);
  }

  private flushDrag(): void {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    const pending = this.pending;
    this.pending = null;
    if (!pending) return;

    if (pending.rotation !== null) {
      setValueAt(pending.layer, 'rotation', this.playheadMs(), pending.rotation);
    }
    if (pending.box) {
      setValueAt(pending.layer, 'x', this.playheadMs(), Math.round(pending.box.x));
      setValueAt(pending.layer, 'y', this.playheadMs(), Math.round(pending.box.y));
      pending.layer.width = Math.round(pending.box.width);
      pending.layer.height = Math.round(pending.box.height);
    }
    // Only the redraw: the whole drag is one change to take back, committed on the release.
    this.bumped.update((count) => count + 1);
  }

  /** How much room the bands have, which is what the scale is worked out against. */
  private watchTimelineRoom(): void {
    const element = this.timelineArea()?.nativeElement;
    if (!element) return;

    this.timelineRoomPx.set(Math.round(element.getBoundingClientRect().width));
    if (typeof ResizeObserver !== 'function') return;

    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) this.timelineRoomPx.set(Math.round(rect.width));
    });
    observer.observe(element);
    this.destroyRef.onDestroy(() => observer.disconnect());
  }

  /**
   * Leans in and out, holding whatever is under the pointer where it was.
   *
   * Drawing out from the left edge would send the moment being worked on off the side.
   */
  protected zoomBy(factor: number, holdPx?: number): void {
    const area = this.timelineArea()?.nativeElement;
    const viewport = this.timelineViewportPx();
    const held = holdPx ?? viewport / 2;
    const before = this.timelineZoom();
    const atMs = xToMs(
      (area ? area.scrollLeft : 0) + held,
      pxPerSecFor(this.durationMs(), trackWidthFor(viewport, before))
    );

    const after = clampZoom(before * factor);
    if (after === before) return;
    this.timelineZoom.set(after);

    if (!area) return;
    // Once the bands have been redrawn at the new scale, put the moment back where it was.
    // Any sooner and the track is still its old width, so the browser holds the scroll to
    // what it was and the moment under the pointer slides off.
    afterNextRender(
      () => {
        area.scrollLeft = scrollToHold(atMs, this.durationMs(), viewport, after, held);
      },
      { injector: this.injector }
    );
  }

  protected zoomIn(): void {
    this.zoomBy(TIMELINE_ZOOM_STEP);
  }

  protected zoomOut(): void {
    this.zoomBy(1 / TIMELINE_ZOOM_STEP);
  }

  protected zoomToFit(): void {
    this.timelineZoom.set(MIN_TIMELINE_ZOOM);
    const area = this.timelineArea()?.nativeElement;
    if (area) area.scrollLeft = 0;
  }

  protected onTimelineWheel(event: WheelEvent): void {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();

    const area = this.timelineArea()?.nativeElement;
    const bounds = area?.getBoundingClientRect();
    const holdPx = bounds ? event.clientX - bounds.left - TIMELINE_HEAD_W_PX : undefined;
    this.zoomBy(event.deltaY < 0 ? TIMELINE_ZOOM_STEP : 1 / TIMELINE_ZOOM_STEP, holdPx);
  }

  private watchStageSize(): void {
    if (typeof ResizeObserver !== 'function') return;

    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      this.stageSize.set({ width: Math.round(rect.width), height: Math.round(rect.height) });
    });

    const element = this.stageArea()?.nativeElement;
    if (element) observer.observe(element);
    this.destroyRef.onDestroy(() => observer.disconnect());
  }
}
