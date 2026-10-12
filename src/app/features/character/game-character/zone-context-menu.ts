import { TranslateFn } from '@axe/application/i18n/translate.token';
import { ZoneMenuModel } from '@axe/application/tabletop/engagement-zone.service';
import { ContextMenuAction } from '@axe/application/ui/context-menu.service';

/** What the zone entries of a piece's menu do. */
export interface ZoneMenuCallbacks {
  declare(foeId: string): void;
  join(zoneId: string): void;
  leave(): void;
  prepareLeave(): void;
  cancelLeave(): void;
  toggleOffField(): void;
  setUnseen(unseen: boolean): void;
  setDown(down: boolean): void;
  setHeld(held: boolean): void;
  grab(captiveId: string): void;
  release(captiveId: string): void;
  /** Lets the piece itself go from whatever holds on to it. */
  breakFree(): void;
  setSquare(zoneId: string, square: boolean): void;
  setLimit(zoneId: string, limit: number | null): void;
  remove(zoneId: string): void;
  checkFire(): void;
  placeSides(): void;
}

/** The limits offered for a zone, besides holding as many as the size table allows: any from 2 to 20. */
export const ZONE_LIMIT_CHOICES: readonly number[] = Array.from({ length: 19 }, (_, index) => index + 2);

/**
 * The engagement-zone entries of a piece's menu, gathered under one entry: declaring a fight with an
 * enemy at the same point, joining a zone the piece stands in, leaving its zone, taking the piece
 * out of the fight or back in, and saying what state it is in: unseen, down, held fast, holding on to
 * an enemy at the same point or held on to by one. Whoever
 * keeps the table also shapes the zone, sets how many it holds and ends it.
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
  if (model.leave?.said) {
    entries.push({ name: t('feature.zone.menu.cancelLeave'), action: () => callbacks.cancelLeave() });
  } else if (model.leave?.maySay) {
    entries.push({ name: t('feature.zone.menu.prepareLeave'), action: () => callbacks.prepareLeave() });
  }
  entries.push({
    name: t(model.offField ? 'feature.zone.menu.onField' : 'feature.zone.menu.offField'),
    action: () => callbacks.toggleOffField(),
  });
  const tick = (on: boolean, key: string) => (on ? '☑ ' : '☐ ') + t(key);
  entries.push({
    name: t('feature.zone.menu.condition'),
    action: undefined,
    subActions: [
      { name: tick(model.unseen, 'feature.zone.menu.unseen'), action: () => callbacks.setUnseen(!model.unseen) },
      { name: tick(model.down, 'feature.zone.menu.down'), action: () => callbacks.setDown(!model.down) },
      { name: tick(model.held, 'feature.zone.menu.held'), action: () => callbacks.setHeld(!model.held) },
      ...(model.grabbedBy
        ? [
            {
              name: '☑ ' + t('feature.zone.menu.grabbedBy', { name: model.grabbedBy.name }),
              action: () => callbacks.breakFree(),
            },
          ]
        : []),
      ...model.grabbing.map((captive) => ({
        name: '☑ ' + t('feature.zone.menu.grabbing', { name: captive.name }),
        action: () => callbacks.release(captive.id),
      })),
      ...model.grabbable.map((foe) => ({
        name: '☐ ' + t('feature.zone.menu.grab', { name: foe.name }),
        action: () => callbacks.grab(foe.id),
      })),
    ],
  });
  if (model.aiming) entries.push({ name: t('feature.zone.menu.checkFire'), action: () => callbacks.checkFire() });
  if (isGameMaster) entries.push({ name: t('feature.zone.menu.placement'), action: () => callbacks.placeSides() });
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
