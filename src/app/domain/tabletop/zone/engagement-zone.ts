import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { ObjectNode } from '@axe/core/sync/object-node';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { ZonePoint } from '@axe/domain/tabletop/zone/zone-geometry';

/**
 * A fight declared on the table, drawn as a circle or a square about the point it stands on.
 *
 * It holds only where it is and how it is drawn. Who is in it is held on each piece, so two people
 * joining at the same moment write to different objects; how big it is follows from how many are
 * in it and is worked out wherever it is needed rather than kept.
 *
 * Every value is kept as text, empty where nothing was written, so a zone that arrives with its
 * attributes missing reads as one with no centre rather than as one standing at the origin.
 */
@SyncObject('engagement-zone')
export class EngagementZone extends ObjectNode {
  @SyncVar() centreX: string = '';
  @SyncVar() centreY: string = '';
  /** The most it may hold, or empty for as many as the size table allows. */
  @SyncVar() capacity: string = '';
  /** `square` for a square, empty for a circle. */
  @SyncVar() shape: string = '';
  /** `1` while it is declared but not yet in force, until the turn it was declared in ends. */
  @SyncVar() forming: string = '';

  /** Where it stands on the table, in pixels, or null where that was never written or cannot be read. */
  get centre(): ZonePoint | null {
    const x = readNumber(this.centreX);
    const y = readNumber(this.centreY);
    return x === null || y === null ? null : { x, y };
  }
  set centre(point: ZonePoint) {
    this.centreX = `${point.x}`;
    this.centreY = `${point.y}`;
  }

  /** The most it may hold, or null to hold as many as the size table allows. */
  get limit(): number | null {
    const held = readNumber(this.capacity);
    return held !== null && held >= 1 ? Math.floor(held) : null;
  }

  get isSquare(): boolean {
    return this.shape === 'square';
  }

  get isForming(): boolean {
    return this.forming === '1';
  }
}

/** The zones on a table, in no particular order. */
export function zonesOn(table: GameTable | null | undefined): EngagementZone[] {
  if (!table) return [];
  return table.children.filter((child): child is EngagementZone => child instanceof EngagementZone);
}

/** A number written as text, or null where the text is empty or not a finite number. */
function readNumber(text: string): number | null {
  const trimmed = `${text ?? ''}`.trim();
  if (trimmed.length < 1) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}
