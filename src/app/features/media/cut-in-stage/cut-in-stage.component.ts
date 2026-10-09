import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  signal,
  untracked,
  viewChildren,
} from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { MotionService } from '@axe/application/ui/motion.service';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { clipCss } from '@axe/domain/media/cut-in-clip';
import { fillCss } from '@axe/domain/media/cut-in-fill';
import { CutInLayer } from '@axe/domain/media/cut-in-layer';
import {
  letterFrames,
  letterMotionOf,
  lettersOf,
  letterTimingOf,
  type PlacedLetter,
} from '@axe/domain/media/cut-in-letter-motion';
import { CutInScene } from '@axe/domain/media/cut-in-scene';
import {
  layerFilter,
  layerOrigin,
  layerTransform,
  layerWindow,
  sampleLayerAt,
  sceneDurationOf,
  toCrumbleFrames,
  toWebAnimationFrames,
  toWipeFrames,
} from '@axe/domain/media/cut-in-scene-timeline';
import { type CutInSpeaker, PORTRAIT_SILHOUETTE_URL, withSpeakerName } from '@axe/domain/media/cut-in-speaker';
import { wipeCss } from '@axe/domain/media/cut-in-wipe';
import { type StageFit, stageFit } from '@axe/features/media/cut-in-editor/cut-in-stage-geometry';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';

/** How many keyframes all the letters of one layer may have between them, before each gets fewer. */
const LETTER_FRAME_BUDGET = 6000;

/**
 * The layers of a cut-in, drawn and set going.
 *
 * The playing window and the editor's preview show the same thing, so this draws for
 * both: playing runs the animations, and holding still puts every one of them at the
 * same moment on the clock.
 *
 * The moving is handed to the browser through the Web Animations API rather than
 * driven a frame at a time. Transforms and opacity then run off the main thread, which
 * is busy decoding pictures and starting sound at exactly the moment a cut-in appears,
 * and nothing here has to wake change detection sixty times a second.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-cut-in-stage',
  templateUrl: './cut-in-stage.component.html',
  host: { class: 'block' },
  imports: [SafePipe],
})
export class CutInStageComponent {
  private readonly objectChange = inject(ObjectChangeService);
  private readonly imageStorage = inject(ImageStorage);
  private readonly motion = inject(MotionService);
  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);
  private readonly t = inject(TRANSLATE_FN);

  readonly scene = input<CutInScene | null>(null);
  /** The coordinates the layers were laid out in, which are the cut-in's own. */
  readonly sceneWidth = input(0);
  readonly sceneHeight = input(0);
  readonly playing = input(true);
  /** Where a shared playback clock already stood when this copy was mounted. */
  readonly startOffsetMs = input(0);
  /** Where the scrubber stands, in ms. Read only while it is not playing. */
  readonly playheadMs = input(0);
  /** How far the stage is leaned into, past the scale that fits the scene in. */
  readonly zoom = input(1);
  /** Who the cut-in is played for: whose portrait and name its layers show where they ask. */
  readonly speaker = input<CutInSpeaker | null>(null);

  private readonly layerElements = viewChildren<ElementRef<HTMLElement>>('layerElement');
  private readonly wipeElements = viewChildren<ElementRef<HTMLElement>>('wipeElement');
  private readonly crumbleElements = viewChildren<ElementRef<HTMLElement>>('crumbleElement');
  private readonly handles = new Map<string, Animation>();
  private readonly wipeHandles = new Map<string, Animation>();
  private readonly crumbleHandles = new Map<string, Animation>();
  private readonly letterHandles = new Map<string, Animation[]>();
  /** The letters each moving text layer was last drawn with, kept while its words stay the same. */
  private readonly letterLines = new Map<string, { text: string; lines: PlacedLetter[][] }>();
  private readonly hostSize = signal({ width: 0, height: 0 });

  readonly layers = computed<CutInLayer[]>(() => {
    const scene = this.scene();
    if (!scene) return [];
    this.objectChange.versionOf(scene.identifier)();
    this.objectChange.collectionOf(CutInLayer.aliasName)();
    return scene.layers.filter((layer) => !layer.hidden);
  });

  readonly durationMs = computed(() => {
    const scene = this.scene();
    if (!scene) return 0;
    this.objectChange.versionOf(scene.identifier)();
    for (const layer of scene.layers) this.objectChange.versionOf(layer.identifier)();
    return sceneDurationOf(scene);
  });

  readonly loops = computed(() => {
    const scene = this.scene();
    if (!scene) return false;
    this.objectChange.versionOf(scene.identifier)();
    return scene.sceneLoop;
  });

  readonly background = computed(() => {
    const scene = this.scene();
    if (!scene) return null;
    this.objectChange.versionOf(scene.identifier)();
    return scene.backgroundColor.length > 0 ? scene.backgroundColor : null;
  });

  /**
   * Where the scene sits inside whatever room it is given.
   *
   * The editor draws its handles over this component from the same measurement and the
   * same helper, so the outline lands exactly on the layer it belongs to.
   */
  readonly fit = computed<StageFit>(() =>
    stageFit({ width: this.sceneWidth(), height: this.sceneHeight() }, this.hostSize(), this.zoom())
  );

  readonly sceneTransform = computed(() => {
    const fit = this.fit();
    return `translate(${fit.offsetX}px, ${fit.offsetY}px) scale(${fit.scale})`;
  });

  constructor() {
    this.watchHostSize();

    // Building is kept apart from running, so moving the scrubber only moves the clock
    // rather than tearing every animation down and putting it up again sixty times a second.
    afterRenderEffect(() => {
      const layers = this.layers();
      const elements = this.layerElements();
      const durationMs = this.durationMs();
      const loops = this.loops();
      const startOffsetMs = this.startOffsetMs();
      // Every layer's own version, so a keyframe moved while the editor is open is picked up.
      for (const layer of layers) this.objectChange.versionOf(layer.identifier)();

      this.build(layers, elements, this.wipeElements(), this.crumbleElements(), durationMs, loops, startOffsetMs);
      this.runTo(untracked(this.playing), untracked(this.playheadMs), layers, elements, durationMs, startOffsetMs);
    });

    afterRenderEffect(() => {
      this.runTo(
        this.playing(),
        this.playheadMs(),
        untracked(this.layers),
        untracked(this.layerElements),
        untracked(this.durationMs),
        this.startOffsetMs()
      );
    });

    this.destroyRef.onDestroy(() => this.clearHandles());
  }

  protected origin(layer: CutInLayer): string {
    return layerOrigin(layer);
  }

  /** Where the words sit along the line, as a flex box says it. */
  protected alignOf(layer: CutInLayer): string {
    if (layer.textAlign === 'left') return 'flex-start';
    return layer.textAlign === 'right' ? 'flex-end' : 'center';
  }

  protected clipOf(layer: CutInLayer): string | null {
    this.objectChange.versionOf(layer.identifier)();
    return clipCss(layer.clip) || null;
  }

  /** What has been let in so far, which the browser then travels along on its own. */
  protected wipeOf(layer: CutInLayer): string | null {
    this.objectChange.versionOf(layer.identifier)();
    if (layer.wipeShape === 'none') return null;
    // Where nothing may animate this is the whole of it; where something does, the
    // animation writes over it.
    return wipeCss(layer.wipeShape, sampleLayerAt(layer, this.playheadMs(), this.durationMs()).wipe) || null;
  }

  /** The same again for what the layer leaves by, which rides on an element of its own. */
  protected crumbleOf(layer: CutInLayer): string | null {
    this.objectChange.versionOf(layer.identifier)();
    if (layer.crumbleShape === 'none') return null;
    return wipeCss(layer.crumbleShape, sampleLayerAt(layer, this.playheadMs(), this.durationMs()).crumble) || null;
  }

  /**
   * The picture a layer shows. A portrait's place shows the speaker's portrait, else the layer's own
   * picture, else a grey head and shoulders.
   */
  protected imageUrl(layer: CutInLayer): string {
    this.objectChange.fileVersion();
    const own = this.imageStorage.get(layer.imageIdentifier)?.url ?? '';
    if (!layer.portraitSlot) return own;
    const portrait = this.speaker()?.imageIdentifier ?? '';
    return (portrait ? this.imageStorage.get(portrait)?.url : '') || own || PORTRAIT_SILHOUETTE_URL;
  }

  /** A text layer's words, with the speaker's name put in where it asks for it. */
  protected textOf(layer: CutInLayer): string {
    return withSpeakerName(layer.text, this.speaker()?.name, this.t('feature.media.cutIn.unknownSpeaker'));
  }

  /**
   * The letters of a text layer whose letters come on one at a time, a line to a list; null for a
   * layer whose words come on all at once.
   */
  protected letterLinesOf(layer: CutInLayer): PlacedLetter[][] | null {
    this.objectChange.versionOf(layer.identifier)();
    if (!letterMotionOf(layer.letterMotion)) return null;
    const text = this.textOf(layer);
    const kept = this.letterLines.get(layer.identifier);
    if (kept?.text === text) return kept.lines;
    const lines = lettersOf(text);
    this.letterLines.set(layer.identifier, { text, lines });
    return lines;
  }

  protected fillOf(layer: CutInLayer): string {
    this.objectChange.versionOf(layer.identifier)();
    return fillCss(layer.fill);
  }

  protected textShadowOf(layer: CutInLayer): string | null {
    if (layer.strokeWidthPx <= 0 || layer.strokeColor.length < 1) return null;
    const width = layer.strokeWidthPx;
    return [
      `${width}px 0 0 ${layer.strokeColor}`,
      `-${width}px 0 0 ${layer.strokeColor}`,
      `0 ${width}px 0 ${layer.strokeColor}`,
      `0 -${width}px 0 ${layer.strokeColor}`,
    ].join(', ');
  }

  private build(
    layers: readonly CutInLayer[],
    elements: readonly ElementRef<HTMLElement>[],
    wipes: readonly ElementRef<HTMLElement>[],
    crumbles: readonly ElementRef<HTMLElement>[],
    durationMs: number,
    loops: boolean,
    startOffsetMs: number
  ): void {
    this.clearHandles();
    if (durationMs < 1) return;

    const options: KeyframeAnimationOptions = {
      duration: durationMs,
      fill: 'both',
      iterations: loops ? Infinity : 1,
    };
    if (startOffsetMs > 0) options.delay = -startOffsetMs;

    for (let at = 0; at < layers.length; at++) {
      const element = elements[at]?.nativeElement;
      if (!element || !this.canAnimate(element)) continue;

      const layer = layers[at];
      this.handles.set(layer.identifier, element.animate(toWebAnimationFrames(layer, durationMs), options));

      // One element carries one clip-path, so what is let in rides on an element of its own.
      const wipeFrames = toWipeFrames(layer, durationMs);
      const wipeElement = wipes[at]?.nativeElement;
      if (wipeFrames.length > 1 && wipeElement) {
        this.wipeHandles.set(layer.identifier, wipeElement.animate(wipeFrames, options));
      }

      const crumbleFrames = toCrumbleFrames(layer, durationMs);
      const crumbleElement = crumbles[at]?.nativeElement;
      if (crumbleFrames.length > 1 && crumbleElement) {
        this.crumbleHandles.set(layer.identifier, crumbleElement.animate(crumbleFrames, options));
      }

      this.animateLetters(element, layer, durationMs, options);
    }
  }

  /**
   * Sets each letter of a text layer whose letters come on one at a time going, on the same clock
   * as the layer, from keyframes worked out by `letterFrames` so the replay video draws the same.
   */
  private animateLetters(
    element: HTMLElement,
    layer: CutInLayer,
    durationMs: number,
    options: KeyframeAnimationOptions
  ): void {
    const motion = letterMotionOf(layer.letterMotion);
    if (!motion) return;
    const letters = [...element.querySelectorAll<HTMLElement>('[data-letter-rank]')];
    if (letters.length < 1) return;
    const timing = letterTimingOf(motion, layer.letterStaggerMs, layer.letterDurationMs);
    const window = layerWindow(layer, durationMs);
    const budget = Math.max(30, Math.min(240, Math.floor(LETTER_FRAME_BUDGET / letters.length)));
    const handles = letters.map((letter) => {
      const rank = Number(letter.dataset['letterRank']);
      const frames = letterFrames(motion, rank, window, durationMs, layer.fontSizePx, timing, budget);
      return letter.animate(
        frames.map((frame) => ({ ...frame })),
        options
      );
    });
    this.letterHandles.set(layer.identifier, handles);
  }

  /** Lets the animations run, or holds every one of them at the same moment. */
  private runTo(
    playing: boolean,
    playheadMs: number,
    layers: readonly CutInLayer[],
    elements: readonly ElementRef<HTMLElement>[],
    durationMs: number,
    startOffsetMs: number
  ): void {
    for (let at = 0; at < layers.length; at++) {
      const layer = layers[at];
      const handle = this.handles.get(layer.identifier);

      if (!handle) {
        const element = elements[at]?.nativeElement;
        if (element) this.paintStill(element, layer, playing ? startOffsetMs : playheadMs, durationMs);
        continue;
      }

      const outlines = [
        this.wipeHandles.get(layer.identifier),
        this.crumbleHandles.get(layer.identifier),
        ...(this.letterHandles.get(layer.identifier) ?? []),
      ];
      if (playing) {
        handle.play();
        for (const outline of outlines) outline?.play();
        continue;
      }
      handle.pause();
      handle.currentTime = playheadMs;
      for (const outline of outlines) {
        if (!outline) continue;
        outline.pause();
        outline.currentTime = playheadMs;
      }
    }
  }

  /** Draws one moment with no animation at all, for a still preview or a quiet screen. */
  private paintStill(element: HTMLElement, layer: CutInLayer, ms: number, durationMs: number): void {
    const sample = sampleLayerAt(layer, ms, durationMs);
    element.style.transform = layerTransform(sample);
    element.style.opacity = `${sample.visible ? sample.opacity : 0}`;
    element.style.filter = layerFilter(sample);
  }

  private canAnimate(element: HTMLElement): boolean {
    return this.motion.enabled() && typeof element.animate === 'function';
  }

  private clearHandles(): void {
    for (const handle of this.handles.values()) stopAnimation(handle);
    this.handles.clear();
    for (const handle of this.wipeHandles.values()) stopAnimation(handle);
    this.wipeHandles.clear();
    for (const handle of this.crumbleHandles.values()) stopAnimation(handle);
    this.crumbleHandles.clear();
    for (const handles of this.letterHandles.values()) for (const handle of handles) stopAnimation(handle);
    this.letterHandles.clear();
  }

  private watchHostSize(): void {
    if (typeof ResizeObserver !== 'function') return;

    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      this.hostSize.set({ width: Math.round(rect.width), height: Math.round(rect.height) });
    });
    observer.observe(this.elementRef.nativeElement);
    this.destroyRef.onDestroy(() => observer.disconnect());
  }
}

/** Stops an animation, with a hand under the promise that says when it ended. */
function stopAnimation(handle: Animation): void {
  handle.finished.catch(() => undefined);
  handle.cancel();
}
