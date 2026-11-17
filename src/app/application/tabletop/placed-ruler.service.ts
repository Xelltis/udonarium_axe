import { computed, inject, Injectable, signal } from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { MeasuredRuler, RulerReadingService } from '@axe/application/tabletop/ruler-reading.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { PickTarget } from '@axe/domain/tabletop/pick/pick-index';
import { RulerLine } from '@axe/domain/tabletop/ruler/ruler-line';
import { Solid, solidFrame } from '@axe/domain/tabletop/solid/solid';
import { aimOf } from '@axe/domain/tabletop/solid/solid-reach';
import type { Vec3 } from '@axe/domain/tabletop/surface-space';
import { TableRuler } from '@axe/domain/tabletop/table-ruler';
import type { TableWorldGuide } from '@axe/domain/tabletop/world/table-solids';

/** The colour a ruler left lying on the table is drawn in. */
export const PLACED_RULER_COLOUR = '#ffb86b';
/** What a press on a ruler left lying on the table is known by. */
export const PLACED_RULER_KIND = 'table-ruler';
/** How far round the line of a ruler left lying a press still takes it, in table pixels. */
const PRESS_REACH_PX = 8;

/** A ruler left lying on the table, as this seat sees it now. */
export interface PlacedRuler extends MeasuredRuler {
  readonly ruler: TableRuler;
  /** Its ends, as written or as this seat is moving them. */
  readonly line: RulerLine;
}

/**
 * The rulers left lying on the table for everyone: where each lies as this seat sees it, its ends held
 * to the pieces they were laid on, the lines it is drawn with and what a press on it lands on. A ruler
 * one of whose ends this seat may not see is not shown to it at all. While this seat moves an end of
 * one, the ruler is drawn where the end is being moved for this seat alone, and written once let go.
 */
@Injectable({ providedIn: 'root' })
export class PlacedRulerService {
  private readonly readings = inject(RulerReadingService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly objectStore = inject(ObjectStore);
  private readonly tabletop = inject(TabletopService);
  private readonly t = inject(TRANSLATE_FN);

  /** The ends this seat is moving, by the ruler they belong to. */
  private readonly holds = signal<ReadonlyMap<string, RulerLine>>(new Map());

  readonly placed = computed<readonly PlacedRuler[]>(() => {
    this.objectChange.collectionOf(TableRuler.aliasName)();
    this.tabletop.currentTableVersion();
    const holds = this.holds();
    const placed: PlacedRuler[] = [];
    for (const ruler of this.objectStore.getObjects<TableRuler>(TableRuler)) {
      this.objectChange.versionOf(ruler.identifier)();
      if (!ruler.isVisibleOnTable) continue;
      const line = holds.get(ruler.identifier) ?? ruler.rulerLine;
      if (!line || !this.readings.maySee(line.from) || !this.readings.maySee(line.to)) continue;
      const measured = this.readings.measure(line);
      if (measured) placed.push({ ruler, line, ...measured });
    }
    return placed;
  });

  /** The lines the rulers left lying on the table are drawn with in the scene. */
  readonly guides = computed<readonly TableWorldGuide[]>(() =>
    this.placed().map((one) => this.readings.guideOf(`ruler#placed#${one.ruler.identifier}`, one, PLACED_RULER_COLOUR))
  );

  /** A ruler left lying on the table, as this seat sees it now, or null for one it does not see. */
  placedOf(identifier: string): PlacedRuler | null {
    return this.placed().find((one) => one.ruler.identifier === identifier) ?? null;
  }

  /** What a press lands on for each ruler left lying on the table: a thin bar along its line. */
  pickTargets(): PickTarget[] {
    return this.placed().map((one) => ({
      id: one.ruler.identifier,
      layer: PLACED_RULER_KIND,
      order: 1,
      surface: 'floor',
      shapes: [{ kind: 'solid', solid: pressShapeOf(one.from, one.to) }],
    }));
  }

  /** Leaves a ruler lying on the table between two ends, for everyone. */
  place(line: RulerLine): TableRuler {
    return TableRuler.create(this.t('feature.ruler.placedName'), line);
  }

  /** Draws a ruler with its ends moved, for this seat alone, until it is let go. */
  hold(identifier: string, line: RulerLine): void {
    const next = new Map(this.holds());
    next.set(identifier, line);
    this.holds.set(next);
  }

  /** Lets go of a ruler whose ends this seat was moving, writing where they were moved to when kept. */
  letGo(identifier: string, keep: boolean): void {
    const line = this.holds().get(identifier);
    if (!line) return;
    const next = new Map(this.holds());
    next.delete(identifier);
    this.holds.set(next);
    if (!keep) return;
    const ruler = this.objectStore.get<TableRuler>(identifier);
    if (ruler instanceof TableRuler) ruler.rulerLine = line;
  }
}

/** The bar along a ruler a press takes it by, or a ball round its ends where they lie together. */
function pressShapeOf(from: Vec3, to: Vec3): Solid {
  const aim = aimOf(from, to);
  if (!aim) return { kind: 'sphere', centre: from, radius: PRESS_REACH_PX };
  return {
    kind: 'beam',
    start: from,
    frame: solidFrame(aim.yaw, aim.pitch),
    length: Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z),
    halfWidth: PRESS_REACH_PX,
  };
}
