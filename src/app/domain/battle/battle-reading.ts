import { asBattleSide, BattleSide } from '@axe/domain/battle/battle-lineup';
import { isGaugeInverted, isGaugeShownOnPiece } from '@axe/domain/character/piece-gauge';
import { resourceElementsOf } from '@axe/domain/character/resource-catalog';
import { shownImageIdentifier } from '@axe/domain/character/shown-image';
import { DataElement } from '@axe/domain/data/data-element';

/** Only what reading a fighter needs of a piece, so a spec need not build one. */
export interface FighterSource {
  identifier: string;
  name: string;
  detailDataElement: DataElement | null;
  imageDataElement: DataElement | null;
  /** Which way the picture faces, `left` or `right`; anything else stands it as drawn. */
  battleFacing?: string;
}

/** One resource of a piece as it read at one moment. */
export interface ResourceReading {
  name: string;
  current: number;
  max: number;
  inverted: boolean;
  /** Whether the piece shows it as a bar over its head. */
  bar: boolean;
}

/** A piece and its resources as they read at one moment, keyed by the resource's own identifier. */
export interface FighterReading {
  identifier: string;
  name: string;
  image: string;
  /** Which way the picture faces, none where it is stood as drawn. */
  facing: BattleSide | null;
  resources: ReadonlyMap<string, ResourceReading>;
}

/** Reads a piece and every resource it carries, as they stand now, and the picture it shows on the table. */
export function readFighter(source: FighterSource): FighterReading {
  const resources = new Map<string, ResourceReading>();
  for (const element of resourceElementsOf(source)) {
    const current = Number(element.currentValue);
    const max = Number(element.value);
    resources.set(element.identifier, {
      name: element.name,
      current: Number.isFinite(current) ? current : 0,
      max: Number.isFinite(max) ? max : 0,
      inverted: isGaugeInverted(element),
      bar: isGaugeShownOnPiece(element),
    });
  }
  return {
    identifier: source.identifier,
    name: source.name,
    image: shownImageIdentifier(source.imageDataElement, source.detailDataElement),
    facing: asBattleSide(source.battleFacing),
    resources,
  };
}

/** Whether anything about a piece's resources moved between two readings of it. */
export function readingsDiffer(before: FighterReading, after: FighterReading): boolean {
  for (const [identifier, now] of after.resources) {
    const then = before.resources.get(identifier);
    if (!then || then.current !== now.current || then.max !== now.max) return true;
  }
  return false;
}
