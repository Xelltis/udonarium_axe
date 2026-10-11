import { TranslateFn } from '@axe/application/i18n/translate.token';
import { ZoneMenuModel } from '@axe/application/tabletop/engagement-zone.service';
import { ContextMenuAction } from '@axe/application/ui/context-menu.service';

/** What the zone entries of a piece's menu do. */
export interface ZoneMenuCallbacks {
  declare(foeId: string): void;
  join(zoneId: string): void;
  leave(): void;
  toggleOffField(): void;
  setSquare(zoneId: string, square: boolean): void;
  setLimit(zoneId: string, limit: number | null): void;
  remove(zoneId: string): void;
}

/** The limits offered for a zone, besides holding as many as the size table allows. */
export const ZONE_LIMIT_CHOICES = [2, 3, 4, 5, 6, 8, 10, 12, 15, 20] as const;

/**
 * The engagement-zone entries of a piece's menu, gathered under one entry: declaring a fight with an
 * enemy at the same point, joining a zone the piece stands in, leaving its zone, and taking the
 * piece out of the fight or back in. Whoever keeps the table also shapes the zone, sets how many it
 * holds and ends it.
 *
 * Nothing where the room does not play zones, or for somebody who may not change the table.
 */
export function buildZoneContextMenu(
  model: ZoneMenuModel,
  canEdit: boolean,
  isGameMaster: boolean,
  callbacks: ZoneMenuCallbacks,
  t: TranslateFn
): ContextMenuAction[] {
  if (!model.enabled || !canEdit) return [];
  const entries: ContextMenuAction[] = [];
  for (const foe of model.foes) {
    entries.push({ name: t('feature.zone.menu.declare', { name: foe.name }), action: () => callbacks.declare(foe.id) });
  }
  model.joinable.forEach((zoneId, index) => {
    entries.push({
      name:
        model.joinable.length > 1
          ? t('feature.zone.menu.joinNumbered', { number: index + 1 })
          : t('feature.zone.menu.join'),
      action: () => callbacks.join(zoneId),
    });
  });
  const zone = model.zone;
  if (zone) entries.push({ name: t('feature.zone.menu.leave'), action: () => callbacks.leave() });
  entries.push({
    name: t(model.offField ? 'feature.zone.menu.onField' : 'feature.zone.menu.offField'),
    action: () => callbacks.toggleOffField(),
  });
  if (zone && isGameMaster) {
    entries.push({
      name: t(zone.square ? 'feature.zone.menu.circle' : 'feature.zone.menu.square'),
      action: () => callbacks.setSquare(zone.id, !zone.square),
    });
    entries.push({
      name: t('feature.zone.menu.limit'),
      action: undefined,
      subActions: [
        {
          name: (zone.limit === null ? '✔ ' : '') + t('feature.zone.menu.limitByTable'),
          action: () => callbacks.setLimit(zone.id, null),
        },
        ...ZONE_LIMIT_CHOICES.map((limit) => ({
          name: (zone.limit === limit ? '✔ ' : '') + `${limit}`,
          action: () => callbacks.setLimit(zone.id, limit),
        })),
      ],
    });
    entries.push({ name: t('feature.zone.menu.remove'), action: () => callbacks.remove(zone.id) });
  }
  return [{ name: t('feature.zone.menu.title'), action: undefined, subActions: entries }];
}
