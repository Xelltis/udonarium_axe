import { NgStyle } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { EffectFieldRenderable, EffectFieldService } from '@axe/application/effect/effect-field.service';
import { effectElapsedOf, EffectPlaybackService } from '@axe/application/effect/effect-playback.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { FirstPersonService } from '@axe/application/tabletop/first-person.service';
import { TABLE_SCREEN } from '@axe/application/tabletop/table-screen';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { PERF_EFFECT_RENDERABLES, perfCounters } from '@axe/core/util/perf-counters';
import { GameCharacter } from '@axe/domain/character/game-character';
import { effectParticlePlacements } from '@axe/domain/effect/effect-particle-placements';
import { EffectSprite, effectSprites } from '@axe/domain/effect/effect-timeline';
import { ViewRotation } from '@axe/domain/effect/effect-view';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import { EffectCanvasComponent } from '@axe/features/effect/effect-canvas/effect-canvas.component';
import {
  EFFECT_CAMERA_LIFT_PX,
  EffectCanvasPlacement,
  effectCanvasStyle,
  effectPaintStyle,
  effectSpriteStyle,
  EffectViewpoint,
  hasEffectPaintLayer,
} from '@axe/features/effect/effect-sprite-style';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { FloorPlaneDirective } from '@axe/ui/tabletop/floor-plane.directive';

export interface EffectEye {
  rotation: ViewRotation;
  liftPx: number;
  risePx: number;
}

const EYE_FLAT_RISE_PX = 1;

const MAX_SPRITES = 400;
const NOTHING_HIDDEN: ReadonlySet<string> = new Set<string>();
const MAX_CANVASES = 24;

@Component({
  selector: 'table-effect-overlay',
  templateUrl: './table-effect-overlay.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  imports: [NgStyle, SafePipe, EffectCanvasComponent, FloorPlaneDirective],
})
export class TableEffectOverlayComponent {
  private readonly playback = inject(EffectPlaybackService);
  private readonly fieldService = inject(EffectFieldService);
  private readonly tabletopService = inject(TabletopService);
  private readonly uiSignalService = inject(UiSignalService);
  private readonly visionService = inject(VisionService);
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly firstPerson = inject(FirstPersonService);

  readonly eye = input<EffectEye | null>(null);

  private readonly camera = inject(TABLE_SCREEN);

  private readonly rotation = computed(() => this.eye()?.rotation ?? this.uiSignalService.tableViewRotation());

  private readonly liftPx = computed(() => this.eye()?.liftPx ?? EFFECT_CAMERA_LIFT_PX);

  private readonly risePx = computed(() => this.eye()?.risePx ?? 0);

  private readonly flatRisePx = computed(() => (this.eye() ? EYE_FLAT_RISE_PX : 0));

  private readonly viewpoint = computed<EffectViewpoint>(() => ({
    rotation: this.rotation(),
    liftPx: this.liftPx(),
    risePx: this.risePx(),
    flatRisePx: this.flatRisePx(),
  }));

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
    if (!this.eye() && this.firstPerson.showing()) return this.nothingToRender;
    if (this.playback.activeCasts().length < 1 && this.fieldService.fields().length < 1) return this.nothingToRender;
    perfCounters.bump(PERF_EFFECT_RENDERABLES);
    const now = this.playback.now();
    const hiddenByKey = this.hiddenByKey();
    const all: EffectFieldRenderable[] = [
      ...this.playback.activeCasts().map((active) => ({
        key: String(active.key),
        preset: active.preset,
        cast: active.cast,
        elapsed: effectElapsedOf(active, now),
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
        viewRotation: this.rotation(),
        resolvePosition: (identifier) => this.centerOf(identifier, gridSize),
        resolveImage: (identifier) => this.imageUrlOf(identifier),
        resolveSize: (identifier) => this.sizeOf(identifier),
      });
      for (const part of parts) sprites.push({ ...part, key: `${active.key}-${part.key}` });
    }
    return sprites.length > MAX_SPRITES ? sprites.slice(0, MAX_SPRITES) : sprites;
  });

  /** The canvases of particles to draw, one per target, with the point of the board each stands at. */
  private readonly placed = computed(() => {
    const gridSize = this.tabletopService.gridSize();
    const placements: { placement: EffectCanvasPlacement; center: { x: number; y: number; z: number } }[] = [];

    for (const active of this.renderables()) {
      if (placements.length >= MAX_CANVASES) break;
      const placed = effectParticlePlacements(
        active.preset,
        active.cast,
        active.elapsed,
        {
          baseSize: gridSize,
          hiddenIdentifiers: active.hidden,
          resolvePosition: (identifier) => this.centerOf(identifier, gridSize),
          resolveSize: (identifier) => this.sizeOf(identifier),
        },
        MAX_CANVASES - placements.length
      );
      for (const placement of placed) {
        placements.push({
          center: placement.center,
          placement: {
            key: `${active.key}-${placement.key}`,
            layer: placement.layer,
            width: placement.layer.width,
            height: placement.layer.height,
            transform: '',
          },
        });
      }
    }
    return placements.length > MAX_CANVASES ? placements.slice(0, MAX_CANVASES) : placements;
  });

  /** The sprites that lie flat on the floor, laid on the plane of the floor on the screen. */
  protected readonly flatSprites = computed(() => this.sprites().filter((sprite) => sprite.flat));

  /** The sprites that stand up, each with the style that lays it on the screen where the point it stands at is drawn. */
  protected readonly standingOnScreen = computed(() => {
    const screen = this.camera.screenOf();
    if (!screen) return [];
    const viewpoint = this.viewpoint();
    return this.sprites()
      .filter((sprite) => !sprite.flat)
      .map((sprite) => {
        const at = screen(sprite.x, sprite.y, sprite.z + viewpoint.risePx, viewpoint.liftPx);
        const parts = [`translate(${at.x}px, ${at.y}px)`, `scale(${at.scale})`];
        if (sprite.offsetX !== 0 || sprite.offsetY !== 0) {
          parts.push(`translate(${sprite.offsetX.toFixed(2)}px, ${sprite.offsetY.toFixed(2)}px)`);
        }
        if (sprite.rotate !== 0) parts.push(`rotateZ(${sprite.rotate.toFixed(2)}deg)`);
        parts.push('translate(-50%, -50%)');
        return { sprite, style: { ...effectSpriteStyle(sprite, viewpoint), transform: parts.join(' ') } };
      });
  });

  /**
   * The canvases of particles, one per target, where the additive blending stays, each laid on the
   * screen where the point it stands at is drawn.
   */
  protected readonly canvasesOnScreen = computed<EffectCanvasPlacement[]>(() => {
    const screen = this.camera.screenOf();
    if (!screen) return [];
    const viewpoint = this.viewpoint();
    return this.placed().map(({ placement, center }) => {
      const at = screen(center.x, center.y, center.z + viewpoint.risePx, viewpoint.liftPx);
      return {
        ...placement,
        transform: `translate(${at.x}px, ${at.y}px) scale(${at.scale}) translate(${-placement.layer.originX}px, ${-placement.layer.originY}px)`,
      };
    });
  });

  protected canvasStyle(placement: EffectCanvasPlacement): Record<string, string> {
    return effectCanvasStyle(placement);
  }

  protected hasPaintLayer(sprite: EffectSprite): boolean {
    return hasEffectPaintLayer(sprite);
  }

  /** The outer layer, which only places it in space and fades it out. */
  protected spriteStyle(sprite: EffectSprite): Record<string, string> {
    return effectSpriteStyle(sprite, this.viewpoint());
  }

  /** The inner layer, which carries the look and the animation. */
  protected paintStyle(sprite: EffectSprite): Record<string, string> {
    return effectPaintStyle(sprite);
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

  /** How many cells across a piece is, as it stands now; one where it is not on the table. */
  private sizeOf(identifier: string): number {
    const size = (this.objectStore.get<TabletopObject>(identifier) as { size?: unknown } | null)?.size;
    return typeof size === 'number' && size > 0 ? size : 1;
  }

  private centerOf(identifier: string, gridSize: number): { x: number; y: number; z: number } | null {
    const object = this.objectStore.get<TabletopObject>(identifier);
    if (!(object instanceof TabletopObject) || !object.isVisibleOnTable) return null;
    const size = (object as { size?: number }).size;
    const half = (gridSize * (typeof size === 'number' && size > 0 ? size : 1)) / 2;
    const raised = this.eye() ? object.altitude * gridSize : 0;
    return { x: object.location.x + half, y: object.location.y + half, z: object.posZ + raised };
  }
}
