import { inject, Injectable } from '@angular/core';
import { type AgentSquare, AgentViews } from '@axe/application/agent/agent-views.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import type { AgentSchema } from '@axe/core/agent/agent-schema';
import type { TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import type { AgentKindField } from '@axe/features/agent-tools/kinds/agent-kind';

/** A square of the table, as the generic tools take and give one. */
export const SQUARE_SCHEMA: AgentSchema = {
  type: 'object',
  description: 'A square of the table: col counted from 1 at the west edge, row from 1 at the north edge.',
  properties: {
    col: { type: 'integer', minimum: 1 },
    row: { type: 'integer', minimum: 1 },
  },
  required: ['col', 'row'],
  additionalProperties: false,
};

/**
 * How a kind of thing keeps where it is: from its north-west corner, as most things dropped in a
 * square are laid, or by its middle, as a range is centred on what it is laid over.
 */
export type SquareAnchor = 'corner' | 'middle';

/**
 * Where a thing lying on the table is, in the squares the AI talks in, for every kind alike. A thing
 * laid from its north-west corner is in the square its first cell fills, and putting it in a square
 * lays that corner on the square's; a thing kept by its middle is in the square its middle is in, and
 * putting it in a square lays its middle on the square's.
 */
@Injectable({ providedIn: 'root' })
export class AgentSquares {
  private readonly views = inject(AgentViews);
  private readonly tabletop = inject(TabletopService);

  /** The square of a thing kept at a point, as it is kept; null for one off the grid. */
  at(x: number, y: number, anchor: SquareAnchor = 'corner'): AgentSquare | null {
    const half = anchor === 'corner' ? this.tabletop.currentTable.gridSize / 2 : 0;
    return this.views.squareAt(x + half, y + half);
  }

  /** The point a thing is kept at for it to be in a square, as it is kept; null for a square off the table. */
  pointOf(square: AgentSquare, anchor: SquareAnchor = 'corner'): { x: number; y: number } | null {
    const middle = this.views.middleOf(square);
    if (!middle) return null;
    const half = anchor === 'corner' ? this.tabletop.currentTable.gridSize / 2 : 0;
    return { x: middle.x - half, y: middle.y - half };
  }

  /** The point a thing laid from its corner is laid at for its first cell to fill a square (see {@link pointOf}). */
  cornerOf(square: AgentSquare): { x: number; y: number } | null {
    return this.pointOf(square, 'corner');
  }

  /**
   * The point a thing is kept at for a square given, as it is kept, or for none the middle of the table
   * in view, where a thing made with no square asked for is laid.
   */
  pointOrMiddle(square: AgentSquare | undefined, anchor: SquareAnchor = 'corner'): { x: number; y: number } {
    const point = square ? this.pointOf(square, anchor) : null;
    if (point) return point;
    const table = this.tabletop.currentTable;
    return { x: (table.width * table.gridSize) / 2, y: (table.height * table.gridSize) / 2 };
  }

  /** {@link pointOrMiddle} for a thing laid from its corner. */
  cornerOrMiddle(square: AgentSquare | undefined): { x: number; y: number } {
    return this.pointOrMiddle(square, 'corner');
  }

  /**
   * The square a thing lying on the table is in, and moving it to another; refused for a square off
   * the table, and for whatever else `refuse` says, as a locked thing is not moved.
   */
  field<T extends TabletopObject>(
    refuse?: (object: T) => string | null,
    anchor: SquareAnchor = 'corner'
  ): AgentKindField<T> {
    return {
      name: 'square',
      description:
        anchor === 'corner'
          ? 'The square it lies in, counted from its north-west corner.'
          : 'The square its middle is in.',
      schema: SQUARE_SCHEMA,
      access: 'write',
      read: (object) => this.at(object.location.x, object.location.y, anchor),
      refuse: (object, value) =>
        refuse?.(object) ?? (this.pointOf(value as AgentSquare, anchor) ? null : 'That square is off the table.'),
      put: (object, value) => {
        const point = this.pointOf(value as AgentSquare, anchor)!;
        object.location.x = point.x;
        object.location.y = point.y;
        object.update();
      },
    };
  }
}
