import { computed, Injectable, signal } from '@angular/core';
import type { TableWorldCap } from '@axe/domain/tabletop/world/table-world';
import type { Table3dCamera } from '@axe/infrastructure/table-3d/table-3d-port';

/** An eye standing among the pieces, which the table's canvas is drawn for in place of the table's own camera. */
export interface TableEye {
  readonly camera: Table3dCamera;
  /** Where on the board the eye stands, which the lights that throw shadows are chosen round. */
  readonly standsAt: { readonly x: number; readonly y: number };
  /** The piece the eye looks out of, which is not drawn, since an eye does not see itself. */
  readonly without: string;
  /** The ceilings over the rooms the eye may look up at, drawn as faces turned down. */
  readonly ceilings: readonly TableWorldCap[];
}

/** What of an eye the scene itself is built from, apart from where the eye stands and looks. */
export interface TableEyeScene {
  readonly without: string;
  readonly ceilings: readonly TableWorldCap[];
}

/**
 * The eye the table's canvas is drawn for while one stands among the pieces, as the first-person
 * view's does, or null while the table's own camera draws it. The view that stands the eye sets it
 * each time the eye moves and clears it when it closes.
 */
@Injectable({ providedIn: 'root' })
export class TableEyeService {
  private readonly shown = signal<TableEye | null>(null);

  readonly eye = this.shown.asReadonly();

  /** The piece left out and the ceilings put in, unchanged while only the eye's place and look change. */
  readonly scene = computed<TableEyeScene | null>(
    () => {
      const eye = this.shown();
      return eye ? { without: eye.without, ceilings: eye.ceilings } : null;
    },
    { equal: (a, b) => a === b || (!!a && !!b && a.without === b.without && a.ceilings === b.ceilings) }
  );

  /** Where the eye stands, to the pixel, so turning the head alone chooses no lights anew. */
  readonly standsAt = computed(
    () => {
      const at = this.shown()?.standsAt;
      return at ? { x: Math.round(at.x), y: Math.round(at.y) } : null;
    },
    { equal: (a, b) => a === b || (!!a && !!b && a.x === b.x && a.y === b.y) }
  );

  show(eye: TableEye): void {
    this.shown.set(eye);
  }

  clear(): void {
    this.shown.set(null);
  }
}
