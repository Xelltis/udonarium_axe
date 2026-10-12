import { TranslateFn } from '@axe/application/i18n/translate.token';
import { ZoneMenuModel } from '@axe/application/tabletop/engagement-zone.service';
import { RideMenuModel } from '@axe/application/tabletop/ride.service';
import { ContextMenuAction } from '@axe/application/ui/context-menu.service';

/** What the entries saying what state a piece is in do. */
export interface ConditionMenuCallbacks {
  setUnseen(unseen: boolean): void;
  setDown(down: boolean): void;
  setProne(prone: boolean): void;
  setHeld(held: boolean): void;
}

/**
 * The entries of a piece's menu saying what state it is in, gathered under one entry: fallen over,
 * and, where the room plays engagement zones, unseen, down and held fast. A piece that fell over in
 * its own turn cannot be got up again that turn, which is shown with why. Holding on to an enemy is
 * something the piece does in a fight, and is offered with the zone's entries.
 *
 * Nothing for somebody who may not change the table.
 */
export function buildConditionContextMenu(
  zone: ZoneMenuModel,
  ride: RideMenuModel,
  canEdit: boolean,
  callbacks: ConditionMenuCallbacks,
  t: TranslateFn
): ContextMenuAction[] {
  if (!canEdit) return [];
  const tick = (on: boolean, label: string) => (on ? '☑ ' : '☐ ') + label;
  const prone = ride.prone;
  const fallen: ContextMenuAction = {
    name:
      tick(prone.on, t('feature.ride.menu.prone')) +
      (prone.refusal ? t(`feature.ride.menu.refusal_${prone.refusal}`) : ''),
    action: () => callbacks.setProne(!prone.on),
    enabled: prone.refusal === null,
  };
  const entries: ContextMenuAction[] = zone.enabled
    ? [
        { name: tick(zone.unseen, t('feature.zone.menu.unseen')), action: () => callbacks.setUnseen(!zone.unseen) },
        { name: tick(zone.down, t('feature.zone.menu.down')), action: () => callbacks.setDown(!zone.down) },
        fallen,
        { name: tick(zone.held, t('feature.zone.menu.held')), action: () => callbacks.setHeld(!zone.held) },
      ]
    : [fallen];
  return [{ name: t('feature.character.contextMenu.conditionGroup'), action: undefined, subActions: entries }];
}
