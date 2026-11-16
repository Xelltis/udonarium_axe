import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { generateUuid } from '@axe/core/util/uuid';
import { appendPieceDataElements } from '@axe/domain/tabletop/piece-data-elements';
import { decodeRulerLine, encodeRulerLine, RulerLine } from '@axe/domain/tabletop/ruler/ruler-line';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';

/**
 * A ruler left lying on the table for everyone, between two ends: each a point of the table, or held
 * to a piece, which it measures from wherever the piece stands. An end held to a piece that is gone
 * stays where it was last written.
 */
@SyncObject('table-ruler')
export class TableRuler extends TabletopObject {
  constructor(identifier: string = generateUuid()) {
    super(identifier);
  }

  @SyncVar() isLock: boolean = false;
  /** Its two ends, as `encodeRulerLine` writes them; read through {@link rulerLine}. */
  @SyncVar() line: string = '';

  /** Its two ends, or null where they were never written or cannot be read. */
  get rulerLine(): RulerLine | null {
    return decodeRulerLine(this.line);
  }
  set rulerLine(line: RulerLine | null) {
    this.line = encodeRulerLine(line);
    if (!line) return;
    this.location = { ...this.location, x: line.from.x, y: line.from.y };
  }

  /** Makes a ruler lying between two ends, under a name, and registers it for sync. */
  static create(name: string, line: RulerLine, identifier?: string): TableRuler {
    const ruler = identifier ? new TableRuler(identifier) : new TableRuler();
    ruler.createDataElements();
    appendPieceDataElements(ruler, name, {});
    ruler.rulerLine = line;
    ruler.initialize();
    return ruler;
  }
}
