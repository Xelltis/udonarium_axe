import { computed, inject, Injectable } from '@angular/core';
import { type EffectFieldRenderable, EffectFieldService } from '@axe/application/effect/effect-field.service';
import { effectElapsedOf, EffectPlaybackService } from '@axe/application/effect/effect-playback.service';
import { type EffectSceneLooks, EffectSceneLooksService } from '@axe/application/effect/effect-scene-looks.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TablePiecesService } from '@axe/application/tabletop/table-pieces.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { nothingStaged, type Staged } from '@axe/domain/effect/scene/choreography';
import type { EffectFooting, EffectStagingOptions } from '@axe/domain/effect/scene/effect-frame';
import { type EffectFrame, EMPTY_EFFECT_FRAME } from '@axe/domain/effect/scene/effect-scene';
import { hasScenePart, isDrawnInScene, sceneLingerMsOf } from '@axe/domain/effect/scene/scene-kinds';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';

const NOTHING_HIDDEN: ReadonlySet<string> = new Set<string>();
/**
 * How far into a round of an effect left standing the next round sets off, as a part of its length:
 * before the last has died down, so that what burns keeps burning.
 */
const NEXT_ROUND_AT = 0.75;

/**
 * What the effects being played draw in the table's scene now, among the pieces and the walls, and
 * the effects left standing on the table as they loop. Every seat works it out from the casts it
 * plays and the fields in the room, so nothing more is sent; with nothing of the kind playing or
 * standing it hands back the same empty frame and reads no clock.
 */
@Injectable({ providedIn: 'root' })
export class EffectFrameService {
  private readonly playback = inject(EffectPlaybackService);
  private readonly tabletop = inject(TabletopService);
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly vision = inject(VisionService);
  private readonly pieces = inject(TablePiecesService);
  private readonly sceneLooks = inject(EffectSceneLooksService);
  private readonly fields = inject(EffectFieldService);

  constructor() {
    // The looks are loaded as the table is first drawn, so the first effect does not wait for them.
    void this.sceneLooks.load();
  }

  readonly frame = computed<EffectFrame>(
    () => {
      const casts = this.playback.activeCasts().filter((active) => hasScenePart(active.preset));
      if (casts.length < 1 && this.fields.fields().length < 1) return EMPTY_EFFECT_FRAME;
      const looks = this.sceneLooks.looks();
      if (!looks) return EMPTY_EFFECT_FRAME;
      const now = this.playback.now();
      const fields = this.fields.renderables(now).filter((field) => isDrawnInScene(field.preset));
      if (casts.length < 1 && fields.length < 1) return EMPTY_EFFECT_FRAME;
      const cellPx = this.tabletop.gridSize();
      const drawn = nothingStaged();
      for (const active of casts) {
        looks.stageEffect(
          active.preset,
          active.cast,
          effectElapsedOf(active, now),
          {
            cellPx,
            hiddenIdentifiers: this.hiddenOf(active.cast.targets.map((target) => target.identifier)),
            resolveFooting: (identifier) => this.footingOf(identifier, cellPx),
            resolveSize: (identifier) => this.sizeOf(identifier),
          },
          drawn
        );
      }
      for (const field of fields) this.stageField(looks, field, { cellPx }, drawn);
      const empty = drawn.motes.length + drawn.floor.length + drawn.ribbons.length + drawn.lights.length < 1;
      if (empty) return EMPTY_EFFECT_FRAME;
      return drawn;
    },
    { equal: (a, b) => a === b }
  );

  /**
   * Stages the rounds of an effect left standing that are under way: each sets off before the last
   * has died down, and what the earlier ones left goes on clearing, the smoke of the last burst still
   * rising as the next goes off, so the loop shows no seam.
   */
  private stageField(
    looks: EffectSceneLooks,
    field: EffectFieldRenderable,
    options: EffectStagingOptions,
    into: Staged
  ): void {
    const round = field.preset.duration;
    if (!(round > 0)) return;
    const every = round * NEXT_ROUND_AT;
    const lingers = sceneLingerMsOf(field.preset);
    for (let elapsed = field.playedMs % every; elapsed < round + lingers; elapsed += every) {
      looks.stageEffect(field.preset, field.cast, elapsed, options, into);
    }
  }

  private hiddenOf(identifiers: readonly string[]): ReadonlySet<string> {
    let hidden: Set<string> | null = null;
    for (const identifier of identifiers) {
      const character = this.objectStore.get<GameCharacter>(identifier);
      if (!(character instanceof GameCharacter)) continue;
      this.objectChange.versionOf(identifier)();
      if (this.vision.isTokenVisible(character)) continue;
      hidden ??= new Set<string>();
      hidden.add(identifier);
    }
    return hidden ?? NOTHING_HIDDEN;
  }

  /** How many cells across a piece is, as it stands now; one where it is not on the table. */
  private sizeOf(identifier: string): number {
    const size = (this.objectStore.get<TabletopObject>(identifier) as { size?: unknown } | null)?.size;
    return typeof size === 'number' && size > 0 ? size : 1;
  }

  /**
   * The middle of a piece's foot as it is drawn now, on the raised ground or the block under it and
   * following it while it is moved, raised as far as it flies, and the floor under it.
   */
  private footingOf(identifier: string, cellPx: number): EffectFooting | null {
    const object = this.objectStore.get<TabletopObject>(identifier);
    if (!(object instanceof TabletopObject) || !object.isVisibleOnTable) return null;
    const half = (cellPx * this.sizeOf(identifier)) / 2;
    const foot = this.pieces.footOf(object);
    const onFloor = foot.surface === 'floor';
    const x = onFloor ? foot.x : object.location.x;
    const y = onFloor ? foot.y : object.location.y;
    const groundZ = onFloor ? foot.height : object.posZ;
    return { x: x + half, y: y + half, z: groundZ + object.altitude * cellPx, groundZ };
  }
}
