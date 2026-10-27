import { NgStyle } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, linkedSignal } from '@angular/core';
import { MotionService } from '@axe/application/ui/motion.service';
import { EffectCast } from '@axe/domain/effect/effect-cast';
import { effectParticlePlacements } from '@axe/domain/effect/effect-particle-placements';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { EffectSprite, EffectSpriteOptions, effectSprites, Point3 } from '@axe/domain/effect/effect-timeline';
import { DEFAULT_VIEW_ROTATION } from '@axe/domain/effect/effect-view';
import { EffectCanvasComponent } from '@axe/features/effect/effect-canvas/effect-canvas.component';
import {
  EFFECT_CAMERA_LIFT_PX,
  effectBillboardTransform,
  EffectCanvasPlacement,
  effectCanvasStyle,
  effectPaintStyle,
  effectSpriteStyle,
  EffectViewpoint,
  hasEffectPaintLayer,
} from '@axe/features/effect/effect-sprite-style';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';

/** The size of a cell on the preview's board, the table's own default. */
const CELL_PX = 50;
/**
 * How small the board is drawn for an effect of the usual size, so that one fired from a few cells
 * away fits the box. A larger effect draws the board smaller still, the piece with it.
 */
const BOARD_SCALE = 0.7;
/** How many cells the board shows across and down. */
const BOARD_CELLS = { across: 8, down: 5 };
/** The stand-in the effect plays on, at the middle of the board. */
const TARGET: Point3 & { identifier: string } = { identifier: 'effect-preview-target', x: 0, y: 0, z: 0 };
/** Where an aimed effect is fired from: a few cells off to the front left. */
const CASTER_POINT: Point3 = { x: -3 * CELL_PX, y: 1.5 * CELL_PX, z: 0 };
/** The pause between one playback and the next, in milliseconds. */
export const EFFECT_PREVIEW_REST_MS = 600;
/** How far through the effect the still is taken while motion is turned off. */
const STILL_AT = 0.5;
const MAX_CANVASES = 8;

const VIEWPOINT: EffectViewpoint = {
  rotation: DEFAULT_VIEW_ROTATION,
  liftPx: EFFECT_CAMERA_LIFT_PX,
  risePx: 0,
  flatRisePx: 0,
};

const SPRITE_OPTIONS: EffectSpriteOptions = {
  baseSize: CELL_PX,
  viewRotation: DEFAULT_VIEW_ROTATION,
  resolvePosition: (identifier) => (identifier === TARGET.identifier ? TARGET : null),
  resolveImage: () => '',
};

/** One moment of the preview: which round of the playback it is in, and how far into that round. */
export interface EffectPreviewFrame {
  round: number;
  elapsed: number;
}

/**
 * Where the preview stands some time after it began playing an effect over and over, each round
 * the effect's own length and a short rest after it.
 */
export function effectPreviewFrameAt(preset: EffectPreset, sinceStartMs: number): EffectPreviewFrame {
  const period = preset.totalDuration(1) + EFFECT_PREVIEW_REST_MS;
  const since = Math.max(0, sinceStartMs);
  return { round: Math.floor(since / period), elapsed: since % period };
}

/**
 * Plays an effect over and over on a stand-in piece in the middle of a small board, tilted as the
 * table is by default, so that it can be seen before it is put to use. An aimed effect is fired
 * from a few cells off. Nothing sounds. While motion is turned off, it shows one still halfway
 * through the effect.
 */
@Component({
  selector: 'effect-preview',
  templateUrl: './effect-preview.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  imports: [NgStyle, SafePipe, EffectCanvasComponent],
})
export class EffectPreviewComponent {
  private readonly motion = inject(MotionService);

  /** The effect to play; nothing plays without one. */
  readonly preset = input<EffectPreset | null>(null);

  /** Whether the preview moves, as the room's effects do only while motion is on. */
  private readonly moving = computed(() => this.motion.enabled());

  /** How long the playback has been going, in milliseconds, from nothing again for each new effect. */
  private readonly sinceStart = linkedSignal({
    source: () => ({ preset: this.preset(), moving: this.moving() }),
    computation: () => 0,
  });

  readonly frame = computed<EffectPreviewFrame>(() => {
    const preset = this.preset();
    if (!preset) return { round: 0, elapsed: 0 };
    if (!this.moving()) return { round: 0, elapsed: preset.duration * STILL_AT };
    return effectPreviewFrameAt(preset, this.sinceStart());
  });

  private readonly cast = computed<EffectCast | null>(() => {
    const preset = this.preset();
    if (!preset) return null;
    return {
      presetIdentifier: preset.identifier,
      casterIdentifier: '',
      origin: CASTER_POINT,
      targets: [{ ...TARGET }],
      seed: this.frame().round + 1,
    };
  });

  readonly sprites = computed<EffectSprite[]>(() => {
    const preset = this.preset();
    const cast = this.cast();
    if (!preset || !cast) return [];
    const { round, elapsed } = this.frame();
    return effectSprites(preset, cast, elapsed, SPRITE_OPTIONS).map((sprite) => ({
      ...sprite,
      key: `${round}-${sprite.key}`,
    }));
  });

  readonly canvases = computed<EffectCanvasPlacement[]>(() => {
    const preset = this.preset();
    const cast = this.cast();
    if (!preset || !cast) return [];
    const { round, elapsed } = this.frame();
    return effectParticlePlacements(preset, cast, elapsed, SPRITE_OPTIONS, MAX_CANVASES).map((placement) => ({
      key: `${round}-${placement.key}`,
      layer: placement.layer,
      width: placement.layer.width,
      height: placement.layer.height,
      transform: effectBillboardTransform(placement.center, placement.layer, VIEWPOINT),
    }));
  });

  protected readonly boardTransform = computed(() => {
    const scale = BOARD_SCALE / Math.max(1, this.preset()?.sizeScale ?? 1);
    return (
      `scale(${scale}) rotateY(${DEFAULT_VIEW_ROTATION.y}deg)` +
      ` rotateX(${DEFAULT_VIEW_ROTATION.x}deg) rotateZ(${DEFAULT_VIEW_ROTATION.z}deg)`
    );
  });

  protected readonly boardStyle: Record<string, string> = {
    left: `${(-BOARD_CELLS.across * CELL_PX) / 2}px`,
    top: `${(-BOARD_CELLS.down * CELL_PX) / 2}px`,
    width: `${BOARD_CELLS.across * CELL_PX}px`,
    height: `${BOARD_CELLS.down * CELL_PX}px`,
    'background-size': `${CELL_PX}px ${CELL_PX}px`,
    'background-position': `${CELL_PX / 2}px ${CELL_PX / 2}px`,
  };

  protected readonly targetStyle: Record<string, string> = {
    left: `${-CELL_PX / 2}px`,
    top: `${-CELL_PX / 2}px`,
    width: `${CELL_PX}px`,
    height: `${CELL_PX}px`,
  };

  constructor() {
    effect((onCleanup) => {
      if (!this.preset() || !this.moving() || typeof requestAnimationFrame !== 'function') return;
      const startedAt = performance.now();
      let handle = 0;
      const tick = (now: number) => {
        this.sinceStart.set(now - startedAt);
        handle = requestAnimationFrame(tick);
      };
      handle = requestAnimationFrame(tick);
      onCleanup(() => cancelAnimationFrame(handle));
    });
  }

  protected canvasStyle(placement: EffectCanvasPlacement): Record<string, string> {
    return effectCanvasStyle(placement);
  }

  protected hasPaintLayer(sprite: EffectSprite): boolean {
    return hasEffectPaintLayer(sprite);
  }

  protected spriteStyle(sprite: EffectSprite): Record<string, string> {
    return effectSpriteStyle(sprite, VIEWPOINT);
  }

  protected paintStyle(sprite: EffectSprite): Record<string, string> {
    return effectPaintStyle(sprite);
  }
}
