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
  grab(captiveId: string): void;
  release(captiveId: string): void;
  /** Lets the piece itself go from whatever holds on to it. */
  breakFree(): void;
  checkFire(): void;
}

/** What the entries managing the zones do. */
export interface ZoneManageCallbacks {
  placeSides(): void;
  setSquare(zoneId: string, square: boolean): void;
  setLimit(zoneId: string, limit: number | null): void;
  remove(zoneId: string): void;
}

/** The limits offered for a zone, besides holding as many as the size table allows: any from 2 to 20. */
export const ZONE_LIMIT_CHOICES: readonly number[] = Array.from({ length: 19 }, (_, index) => index + 2);

/**
 * The engagement-zone entries of a piece's menu, gathered under one entry: declaring a fight with an
 * enemy at the same point, joining a zone the piece stands in, leaving its zone, taking the piece
 * out of the fight or back in, holding on to an enemy at the same point or letting go, and checking
 * the line of fire while another piece is aimed at. Setting the sides out and changing a zone itself
 * are left to `buildZoneManageContextMenu`.
 *
 * Nothing where the room does not play zones, or for somebody who may not change the table.
 */
export function buildZoneContextMenu(
  model: ZoneMenuModel,
  canEdit: boolean,
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
  if (model.zone) entries.push({ name: t('feature.zone.menu.leave'), action: () => callbacks.leave() });
  if (model.leave?.said) {
    entries.push({ name: t('feature.zone.menu.cancelLeave'), action: () => callbacks.cancelLeave() });
  } else if (model.leave?.maySay) {
    entries.push({ name: t('feature.zone.menu.prepareLeave'), action: () => callbacks.prepareLeave() });
  }
  entries.push({
    name: t(model.offField ? 'feature.zone.menu.onField' : 'feature.zone.menu.offField'),
    action: () => callbacks.toggleOffField(),
  });
  if (model.grabbedBy) {
    entries.push({
      name: '☑ ' + t('feature.zone.menu.grabbedBy', { name: model.grabbedBy.name }),
      action: () => callbacks.breakFree(),
    });
  }
  for (const captive of model.grabbing) {
    entries.push({
      name: '☑ ' + t('feature.zone.menu.grabbing', { name: captive.name }),
      action: () => callbacks.release(captive.id),
    });
  }
  for (const foe of model.grabbable) {
    entries.push({
      name: '☐ ' + t('feature.zone.menu.grab', { name: foe.name }),
      action: () => callbacks.grab(foe.id),
    });
  }
  if (model.aiming) entries.push({ name: t('feature.zone.menu.checkFire'), action: () => callbacks.checkFire() });
  return [{ name: t('feature.zone.menu.title'), action: undefined, subActions: entries }];
}

/**
 * The entries managing the zones, gathered under one entry for whoever keeps the table: setting the
 * sides out at the start of a fight, and, for a piece in a zone, shaping that zone, setting how many
 * it holds and ending it.
 *
 * Nothing where the room does not play zones, or for anybody else.
 */
export function buildZoneManageContextMenu(
  model: ZoneMenuModel,
  canEdit: boolean,
  isGameMaster: boolean,
  callbacks: ZoneManageCallbacks,
  t: TranslateFn
): ContextMenuAction[] {
  if (!model.enabled || !canEdit || !isGameMaster) return [];
  const entries: ContextMenuAction[] = [
    { name: t('feature.zone.menu.placement'), action: () => callbacks.placeSides() },
  ];
  const zone = model.zone;
  if (zone) {
    entries.push(
      {
        name: t(zone.square ? 'feature.zone.menu.circle' : 'feature.zone.menu.square'),
        action: () => callbacks.setSquare(zone.id, !zone.square),
      },
      {
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
      },
      { name: t('feature.zone.menu.remove'), action: () => callbacks.remove(zone.id) }
    );
  }
  return [{ name: t('feature.zone.menu.manage'), action: undefined, subActions: entries }];
}
