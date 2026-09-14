import { NgStyle } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { EffectFieldRenderable, EffectFieldService } from '@axe/application/effect/effect-field.service';
import { EffectPlaybackService } from '@axe/application/effect/effect-playback.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { PERF_EFFECT_RENDERABLES, perfCounters } from '@axe/core/util/perf-counters';
import { GameCharacter } from '@axe/domain/character/game-character';
import { EffectParticleLayer, effectParticles } from '@axe/domain/effect/effect-particles';
import { stagedEffectParticles } from '@axe/domain/effect/effect-stage-timeline';
import {
  EffectSprite,
  effectSprites,
  effectTargetCenter,
  effectTargetProgress,
} from '@axe/domain/effect/effect-timeline';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import { EffectCanvasComponent } from '@axe/features/effect/effect-canvas/effect-canvas.component';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';

export interface EffectCanvasPlacement {
  key: string;
  layer: EffectParticleLayer;
  transform: string;
  width: number;
  height: number;
}

/**
 * How far towards the camera the effect sits, in pixels.
 * A billboard sits at the same depth as the pieces and their names, so without a nudge
 * forwards it disappears behind a label and the effect looks broken.
 */
const CAMERA_LIFT_PX = 40;

const MAX_SPRITES = 400;
const NOTHING_HIDDEN: ReadonlySet<string> = new Set<string>();
const MAX_CANVASES = 24;

@Component({
  selector: 'table-effect-overlay',
  templateUrl: './table-effect-overlay.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  imports: [NgStyle, SafePipe, EffectCanvasComponent],
})
export class TableEffectOverlayComponent {
  private readonly playback = inject(EffectPlaybackService);
  private readonly fieldService = inject(EffectFieldService);
  private readonly tabletopService = inject(TabletopService);
  private readonly uiSignalService = inject(UiSignalService);
  private readonly visionService = inject(VisionService);
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);

  /**
   * Gathers the effects playing and the fields left standing into one thing to draw.
   *
   * Whether a target can be seen is settled once here; asking separately for the billboards
   * and the particles would run that check twice a frame for every target.
   */
  private readonly hiddenByKey = computed<ReadonlyMap<string, ReadonlySet<string>>>(() => {
    const hidden = new Map<string, ReadonlySet<string>>();
    for (const active of this.playback.activeCasts()) {
      hidden.set(String(active.key), this.hiddenIdentifiersOf(active.cast.targets.map((target) => target.identifier)));
    }
    for (const field of this.fieldService.fields()) {
      hidden.set(`field-${field.identifier}`, this.hiddenIdentifiersOf([field.identifier]));
    }
    return hidden;
  });

  private readonly nothingToRender: (EffectFieldRenderable & { hidden: ReadonlySet<string> })[] = [];

  /**
   * Everything to draw this frame.
   *
   * With no cast playing and no field standing it reads no clock and hands back the same empty
   * list, so the weather keeping the frame loop running does not rebuild the sprites every frame.
   */
  private readonly renderables = computed<(EffectFieldRenderable & { hidden: ReadonlySet<string> })[]>(() => {
    if (this.playback.activeCasts().length < 1 && this.fieldService.fields().length < 1) return this.nothingToRender;
    perfCounters.bump(PERF_EFFECT_RENDERABLES);
    const now = this.playback.now();
    const hiddenByKey = this.hiddenByKey();
    const all: EffectFieldRenderable[] = [
      ...this.playback.activeCasts().map((active) => ({
        key: String(active.key),
        preset: active.preset,
        cast: active.cast,
        elapsed: now - active.startedAt,
      })),
      ...this.fieldService.renderables(now),
    ];
    return all.map((active) => ({ ...active, hidden: hiddenByKey.get(active.key) ?? NOTHING_HIDDEN }));
  });

  readonly sprites = computed<EffectSprite[]>(() => {
    const gridSize = this.tabletopService.gridSize();
    const sprites: EffectSprite[] = [];

    for (const active of this.renderables()) {
      const hiddenIdentifiers = active.hidden;
      const parts = effectSprites(active.preset, active.cast, active.elapsed, {
        baseSize: gridSize,
        hiddenIdentifiers,
        viewRotation: this.uiSignalService.tableViewRotation(),
        resolvePosition: (identifier) => this.centerOf(identifier, gridSize),
        resolveImage: (identifier) => this.imageUrlOf(identifier),
      });
      for (const part of parts) sprites.push({ ...part, key: `${active.key}-${part.key}` });
    }
    return sprites.length > MAX_SPRITES ? sprites.slice(0, MAX_SPRITES) : sprites;
  });

  /** The glowing particles go onto one canvas per target, where the additive blending stays and does not flatten the depth. */
  readonly canvases = computed<EffectCanvasPlacement[]>(() => {
    const gridSize = this.tabletopService.gridSize();
    const placements: EffectCanvasPlacement[] = [];

    for (const active of this.renderables()) {
      if (placements.length >= MAX_CANVASES) break;

      const hiddenIdentifiers = active.hidden;
      const base = gridSize * active.preset.sizeScale;

      // A run glows once per stage that is up, each where that stage is happening.
      if (active.preset.isStaged) {
        for (const placement of stagedEffectParticles(
          active.preset,
          active.preset.stageList,
          active.cast,
          active.elapsed,
          base,
          {
            baseSize: gridSize,
            hiddenIdentifiers,
            resolvePosition: (identifier) => this.centerOf(identifier, gridSize),
          },
          effectParticles,
          MAX_CANVASES - placements.length
        )) {
          placements.push({
            key: `${active.key}-${placement.key}`,
            layer: placement.layer,
            width: placement.layer.width,
            height: placement.layer.height,
            transform: this.billboardTransform(placement.center, placement.layer),
          });
        }
        // The next effect still has its own canvases; this one merely has no targets to walk.
        continue;
      }

      active.cast.targets.forEach((target, index) => {
        if (hiddenIdentifiers.has(target.identifier)) return;
        if (placements.length >= MAX_CANVASES) return;
        const progress = effectTargetProgress(active.preset, active.elapsed, index);
        if (progress < 0 || progress > 1) return;

        const layer = effectParticles(active.preset, active.cast.seed + index * 7919, progress, base);
        if (layer.particles.length < 1) return;

        const center = effectTargetCenter(target, active.preset, {
          baseSize: gridSize,
          resolvePosition: (identifier) => this.centerOf(identifier, gridSize),
        });
        placements.push({
          key: `${active.key}-${index}`,
          layer,
          width: layer.width,
          height: layer.height,
          transform: this.billboardTransform(center, layer),
        });
      });
    }
    return placements.length > MAX_CANVASES ? placements.slice(0, MAX_CANVASES) : placements;
  });

  protected canvasStyle(placement: EffectCanvasPlacement): Record<string, string> {
    return {
      position: 'absolute',
      left: '0px',
      top: '0px',
      width: placement.width + 'px',
      height: placement.height + 'px',
      'transform-origin': '0 0',
      transform: placement.transform,
      'pointer-events': 'none',
    };
  }

  protected hasPaintLayer(sprite: EffectSprite): boolean {
    return sprite.animation.length > 0 || sprite.svg.length > 0;
  }

  /** The outer layer, which only places it in space and fades it out. */
  protected spriteStyle(sprite: EffectSprite): Record<string, string> {
    const style: Record<string, string> = {
      position: 'absolute',
      left: '0px',
      top: '0px',
      width: sprite.width + 'px',
      height: sprite.height + 'px',
      opacity: sprite.opacity.toFixed(3),
      'transform-origin': '0 0',
      transform: this.transform(sprite),
      'pointer-events': 'none',
    };
    if (!this.hasPaintLayer(sprite)) Object.assign(style, this.paint(sprite));
    return style;
  }

  /** The inner layer, which carries the look and the animation. */
  protected paintStyle(sprite: EffectSprite): Record<string, string> {
    const style = this.paint(sprite);
    if (sprite.animation.length > 0) style['animation'] = sprite.animation;
    style['transform-origin'] = sprite.origin.length > 0 ? sprite.origin : '50% 50%';
    return style;
  }

  private paint(sprite: EffectSprite): Record<string, string> {
    const style: Record<string, string> = {};
    if (sprite.background.length > 0) style['background'] = sprite.background;
    if (sprite.borderRadius.length > 0) style['border-radius'] = sprite.borderRadius;
    if (sprite.clipPath.length > 0) style['clip-path'] = sprite.clipPath;
    if (sprite.shadow.length > 0) {
      // A drawing does not always fill its element, so a box shadow lights the box rather than
      // the picture and shows a square edge. A drop shadow follows the outline instead.
      if (sprite.svg.length > 0) style['filter'] = dropShadowOf(sprite.shadow);
      else style['box-shadow'] = sprite.shadow;
    }
    return style;
  }

  private billboardTransform(center: { x: number; y: number; z: number }, layer: EffectParticleLayer): string {
    const rotation = this.uiSignalService.tableViewRotation();
    return (
      `translate3d(${center.x}px, ${center.y}px, ${center.z}px)` +
      ` rotateZ(${-(rotation?.z ?? 10)}deg) rotateX(${-(rotation?.x ?? 50)}deg) rotateY(${-(rotation?.y ?? 0)}deg)` +
      ` translateZ(${CAMERA_LIFT_PX}px) translate(${-layer.originX}px, ${-layer.originY}px)`
    );
  }

  private transform(sprite: EffectSprite): string {
    const parts = [`translate3d(${sprite.x}px, ${sprite.y}px, ${sprite.z}px)`];

    if (!sprite.flat) {
      const rotation = this.uiSignalService.tableViewRotation();
      parts.push(
        `rotateZ(${-(rotation?.z ?? 10)}deg)`,
        `rotateX(${-(rotation?.x ?? 50)}deg)`,
        `rotateY(${-(rotation?.y ?? 0)}deg)`,
        `translateZ(${CAMERA_LIFT_PX}px)`
      );
    }
    // The offset is applied inside the billboard, so the arrangement holds as the camera turns.
    if (sprite.offsetX !== 0 || sprite.offsetY !== 0) {
      parts.push(`translate(${sprite.offsetX.toFixed(2)}px, ${sprite.offsetY.toFixed(2)}px)`);
    }
    if (sprite.rotate !== 0) parts.push(`rotateZ(${sprite.rotate.toFixed(2)}deg)`);
    parts.push('translate(-50%, -50%)');

    return parts.join(' ');
  }

  /** Collapsing and cleaving cut the picture of the piece itself and move the parts. */
  private imageUrlOf(identifier: string): string {
    const object = this.objectStore.get<TabletopObject>(identifier);
    if (!(object instanceof TabletopObject)) return '';
    return object.imageFile?.url ?? '';
  }

  private hiddenIdentifiersOf(identifiers: readonly string[]): ReadonlySet<string> {
    const hidden = new Set<string>();
    for (const identifier of identifiers) {
      const character = this.objectStore.get<GameCharacter>(identifier);
      if (!(character instanceof GameCharacter)) continue;
      this.objectChange.versionOf(identifier)();
      if (!this.visionService.isTokenVisible(character)) hidden.add(identifier);
    }
    return hidden;
  }

  private centerOf(identifier: string, gridSize: number): { x: number; y: number; z: number } | null {
    const object = this.objectStore.get<TabletopObject>(identifier);
    if (!(object instanceof TabletopObject) || !object.isVisibleOnTable) return null;
    const size = (object as { size?: number }).size;
    const half = (gridSize * (typeof size === 'number' && size > 0 ? size : 1)) / 2;
    return { x: object.location.x + half, y: object.location.y + half, z: object.posZ };
  }
}

/** Reads a box shadow as a drop shadow of the same spread. */
function dropShadowOf(shadow: string): string {
  return shadow
    .split(', ')
    .map((layer) => `drop-shadow(${layer})`)
    .join(' ');
}
