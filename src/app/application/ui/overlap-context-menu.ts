import { TranslateFn } from '@axe/application/i18n/translate.token';
import { ContextMenuAction } from '@axe/application/ui/context-menu.service';
import { TabletopOverlapService } from '@axe/application/ui/tabletop-overlap.service';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import { moveToBottommost, moveToTopmost, Stackable } from '@axe/domain/tabletop/tabletop-object-util';

const ALIAS_LABEL_KEY: Record<string, string> = {
  terrain: 'feature.tabletop.contextMenu.aliasTerrain',
  character: 'feature.tabletop.contextMenu.aliasCharacter',
  'table-mask': 'feature.tabletop.contextMenu.aliasMask',
  'text-note': 'feature.tabletop.contextMenu.aliasTextNote',
  range: 'feature.tabletop.contextMenu.aliasRange',
  'dice-symbol': 'feature.tabletop.contextMenu.aliasDiceSymbol',
  coin: 'feature.tabletop.contextMenu.aliasCoin',
  card: 'feature.tabletop.contextMenu.aliasCard',
  'card-stack': 'feature.tabletop.contextMenu.aliasCardStack',
};

function describeObject(obj: TabletopObject, t: TranslateFn): string {
  const aliasLabel = ALIAS_LABEL_KEY[obj.aliasName] ? t(ALIAS_LABEL_KEY[obj.aliasName]) : obj.aliasName;
  const name = obj.name?.trim();
  return name ? `${aliasLabel}: ${name}` : aliasLabel;
}

function asStackable(obj: TabletopObject): Stackable | null {
  return typeof (obj as TabletopObject & { zindex?: unknown }).zindex === 'number' ? (obj as Stackable) : null;
}

/**
 * Menu entries for the other pieces lying under the pointer besides the one right-clicked.
 *
 * Each overlapping piece reopens its own context menu at the same point, and a piece with a
 * stacking order also gets entries to bring it to the top or send it to the bottom. Empty when
 * nothing else is under the pointer.
 */
export function buildOverlapContextMenu(
  service: TabletopOverlapService,
  current: TabletopObject,
  pointerX: number,
  pointerY: number,
  t: TranslateFn
): ContextMenuAction[] {
  const overlapping = service.findAt(pointerX, pointerY).filter((o) => o.identifier !== current.identifier);
  if (overlapping.length === 0) return [];

  const subActions: ContextMenuAction[] = overlapping.map((obj) => ({
    name: describeObject(obj, t),
    action: () => service.reopenContextMenuFor(obj.identifier, pointerX, pointerY),
  }));

  const entries: ContextMenuAction[] = [
    {
      name: t('feature.tabletop.contextMenu.overlapBelow', { count: overlapping.length }),
      action: undefined,
      subActions,
    },
  ];

  const stackable = asStackable(current);
  if (stackable) {
    entries.push(
      {
        name: t('feature.tabletop.contextMenu.moveToTopmost'),
        action: () => moveToTopmost(stackable),
      },
      {
        name: t('feature.tabletop.contextMenu.moveToBottommost'),
        action: () => moveToBottommost(stackable),
      }
    );
  }

  return entries;
}
