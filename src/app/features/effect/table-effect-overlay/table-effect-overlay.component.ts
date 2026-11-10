import { NgStyle } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { type EffectFieldRenderable, EffectFieldService } from '@axe/application/effect/effect-field.service';
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
import { EffectSprite, effectSprites } from '@axe/domain/effect/effect-timeline';
import { ViewRotation } from '@axe/domain/effect/effect-view';
import { drawsOnlyPicturesOver } from '@axe/domain/effect/scene/scene-kinds';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import {
  EFFECT_CAMERA_LIFT_PX,
  effectPaintStyle,
  effectSpriteStyle,
  EffectViewpoint,
  hasEffectPaintLayer,
} from '@axe/features/effect/effect-sprite-style';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';

export interface EffectEye {
  rotation: ViewRotation;
  liftPx: number;
  risePx: number;
}

const MAX_SPRITES = 400;
const NOTHING_HIDDEN: ReadonlySet<string> = new Set<string>();

/** One effect to draw over the table at a moment, a cast or a field, with the targets out of sight. */
type Renderable = Pick<EffectFieldRenderable, 'key' | 'preset' | 'cast' | 'elapsed'> & { hidden: ReadonlySet<string> };

/**
 * Draws over the table what the effects that cut a piece's own picture do with it: the picture cut up
 * and flown apart or parted, laid on the screen where the piece stands. All else an effect draws is
 * drawn in the table's scene itself, among the pieces.
 */
@Component({
  selector: 'table-effect-overlay',
  templateUrl: './table-effect-overlay.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  imports: [NgStyle, SafePipe],
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

  private readonly viewpoint = computed<EffectViewpoint>(() => ({
    rotation: this.rotation(),
    liftPx: this.liftPx(),
    risePx: this.risePx(),
    flatRisePx: 0,
  }));

  /**
   * Which targets of each effect playing and each field left standing are out of sight, settled once
   * a cast rather than once a frame for every target.
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

  private readonly nothingToRender: Renderable[] = [];

  /**
   * The effects that cut a piece's own picture, whose picture is drawn over the table this frame; all
   * else of them, and every other effect, is drawn in the table's scene itself.
   *
   * With no cast playing and no field standing it reads no clock and hands back the same empty
   * list, so the weather keeping the frame loop running does not rebuild the sprites every frame.
   */
  private readonly renderables = computed<Renderable[]>(() => {
    if (!this.eye() && this.firstPerson.showing()) return this.nothingToRender;
    if (this.playback.activeCasts().length < 1 && this.fieldService.fields().length < 1) return this.nothingToRender;
    perfCounters.bump(PERF_EFFECT_RENDERABLES);
    const now = this.playback.now();
    const hiddenByKey = this.hiddenByKey();
    const all: Omit<Renderable, 'hidden'>[] = [
      ...this.playback
        .activeCasts()
        .flatMap((active) => (drawsOnlyPicturesOver(active.preset) ? [active] : []))
        .map((active) => ({
          key: String(active.key),
          preset: active.preset,
          cast: active.cast,
          elapsed: effectElapsedOf(active, now),
        })),
      ...this.fieldService.renderables(now).filter((field) => drawsOnlyPicturesOver(field.preset)),
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
      for (const part of parts) {
        if (part.background.includes('url(')) sprites.push({ ...part, key: `${active.key}-${part.key}` });
      }
    }
    return sprites.length > MAX_SPRITES ? sprites.slice(0, MAX_SPRITES) : sprites;
  });

  /** The pieces of the pictures, each with the style that lays it on the screen where the point it stands at is drawn. */
  protected readonly standingOnScreen = computed(() => {
    const screen = this.camera.screenOf();
    if (!screen) return [];
    const viewpoint = this.viewpoint();
    return this.sprites().map((sprite) => {
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

  protected hasPaintLayer(sprite: EffectSprite): boolean {
    return hasEffectPaintLayer(sprite);
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
