import { TranslateFn } from '@axe/application/i18n/translate.token';
import { ContextMenuAction, ContextMenuSeparator } from '@axe/application/ui/context-menu.service';
import {
  buildCopyAction,
  buildDeleteAction,
  buildLockToggleAction,
} from '@axe/application/ui/tabletop-context-menu-actions';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { RulerLine } from '@axe/domain/tabletop/ruler/ruler-line';
import type { Vec3 } from '@axe/domain/tabletop/surface-space';
import { TableRuler } from '@axe/domain/tabletop/table-ruler';

/**
 * The right-click menu of a ruler left lying on the table: locking it, letting its ends go of the
 * pieces they are held to, where they stand now, a copy of it a cell down and across, free of any
 * piece, and taking it away. A locked ruler keeps its ends as they are.
 */
export function buildTableRulerContextMenu(
  ruler: TableRuler,
  points: { readonly from: Vec3; readonly to: Vec3 },
  gridSize: number,
  t: TranslateFn
): ContextMenuAction[] {
  const line = ruler.rulerLine;
  const held = !!(line?.from.piece || line?.to.piece);
  const free = (point: Vec3, by = 0): RulerLine['from'] => ({ x: point.x + by, y: point.y + by, z: point.z });
  return [
    buildLockToggleAction(ruler.isLock, (next) => (ruler.isLock = next), t),
    ...(held && !ruler.isLock
      ? [
          {
            name: t('feature.ruler.letGoOfPieces'),
            action: () => {
              ruler.rulerLine = { from: free(points.from), to: free(points.to) };
              SoundEffect.play(PresetSound.unlock);
            },
          },
        ]
      : []),
    ContextMenuSeparator,
    buildCopyAction(ruler, gridSize, t, {
      afterClone: (copy) => {
        copy.isLock = false;
        copy.rulerLine = { from: free(points.from, gridSize), to: free(points.to, gridSize) };
      },
    }),
    buildDeleteAction(ruler, t),
  ];
}
