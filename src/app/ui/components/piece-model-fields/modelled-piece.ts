import type { ObjectChangeService } from '@axe/application/sync/object-change.service';
import type { PieceModelFields } from '@axe/domain/tabletop/piece-model';

/** A piece or a block whose 3D model is set up. */
export type ModelledPiece = PieceModelFields & {
  readonly identifier: string;
  modelIdentifier: string;
  modelScale: string;
  modelTurn: string;
  modelIdle: string;
  modelWalk: string;
  modelLook: string;
  modelMotions: string;
  modelFace: string;
};

/** The fields of a piece that say how its model is drawn and moved. */
export type ModelFieldChanges = Partial<
  Pick<
    ModelledPiece,
    | 'modelIdentifier'
    | 'modelScale'
    | 'modelTurn'
    | 'modelIdle'
    | 'modelWalk'
    | 'modelLook'
    | 'modelMotions'
    | 'modelFace'
  >
>;

/** Writes what is changed of a piece's model to the piece, and tells the room. */
export function writeModelFields(
  target: ModelledPiece,
  changes: ModelFieldChanges,
  objectChange: Pick<ObjectChangeService, 'notifyChanged'>
): void {
  Object.assign(target, changes);
  objectChange.notifyChanged(target.identifier);
}

/** What the fields of the model's setting up are styled with, shared by the parts it is laid out in. */
export const MODEL_FIELD_STYLES = {
  row: 'flex items-center gap-1.5 text-[0.82em]',
  label: 'text-ui-muted w-[5em] shrink-0 text-[0.85em] whitespace-nowrap',
  input:
    'bg-ui-input border-ui-border-input text-ui-text rounded-ui-sm min-w-0 flex-1 border border-solid px-1.25 py-0.5 text-[0.82em]',
  number:
    'bg-ui-input border-ui-border-input text-ui-text rounded-ui-sm w-[5em] border border-solid px-1.25 py-0.5 text-right text-[0.82em]',
  button:
    'border-ui-accent text-ui-accent hover:bg-ui-accent-bg inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-xs border border-solid bg-transparent px-2 py-0.5 text-[0.78em] whitespace-nowrap',
  check: 'text-ui-text flex cursor-pointer items-center gap-1 text-[0.85em]',
  value: 'text-ui-muted w-[2.6em] shrink-0 text-right text-[0.78em] tabular-nums',
} as const;
