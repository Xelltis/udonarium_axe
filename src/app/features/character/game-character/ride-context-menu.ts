import { TranslateFn } from '@axe/application/i18n/translate.token';
import { RideMenuModel } from '@axe/application/tabletop/ride.service';
import { ContextMenuAction } from '@axe/application/ui/context-menu.service';
import { RideSeat } from '@axe/domain/tabletop/ride/ride-rules';

/** What the riding entries of a piece's menu do. */
export interface RideMenuCallbacks {
  getOn(mountId: string, seat: RideSeat): void;
  getOff(): void;
  setProne(prone: boolean): void;
  setMountable(mountable: boolean): void;
  setPassenger(passenger: boolean): void;
  setCargo(cargo: number): void;
  setAnyone(anyone: boolean): void;
  setSeatHeight(cells: number | null): void;
}

/** How many loads a mount may be set to carry. */
export const CARGO_CHOICES: readonly number[] = [0, 1, 2, 3, 4, 5, 6];

/** The heights a mount's riders may be set to stand at, in cells; null for half the mount's size. */
export const SEAT_HEIGHT_CHOICES: readonly (number | null)[] = [null, 0, 0.5, 1, 1.5, 2, 3];

/**
 * The riding entries of a piece's menu. Getting on a mount it stands on, in a seat free there, or
 * off the one it rides, stand on the menu's first level, where they are found at once; a seat the
 * piece may not take, and getting on or off where it has done so this turn, are shown with why and
 * cannot be chosen. Saying the piece has fallen over or got up, and making it a mount and saying what
 * it takes, are gathered under one entry.
 *
 * Nothing for somebody who may not change the table.
 */
export function buildRideContextMenu(
  model: RideMenuModel,
  canEdit: boolean,
  callbacks: RideMenuCallbacks,
  t: TranslateFn
): ContextMenuAction[] {
  if (!canEdit) return [];
  const onAndOff: ContextMenuAction[] = [];
  const changeRefusal = model.changeRefusal;
  if (model.riding) {
    onAndOff.push({
      name:
        t('feature.ride.menu.off', { mount: model.riding.mount }) +
        (changeRefusal ? t(`feature.ride.menu.refusal_${changeRefusal}`) : ''),
      action: () => callbacks.getOff(),
      enabled: changeRefusal === null,
    });
  }
  for (const offer of model.offers) {
    for (const { seat, refusal } of offer.seats) {
      const why = refusal ?? changeRefusal;
      onAndOff.push({
        name:
          t(`feature.ride.menu.on_${seat}`, { mount: offer.name }) + (why ? t(`feature.ride.menu.refusal_${why}`) : ''),
        action: () => callbacks.getOn(offer.id, seat),
        enabled: why === null,
      });
    }
  }
  const entries: ContextMenuAction[] = [];
  const prone = model.prone;
  entries.push({
    name:
      (prone.on ? '☑ ' : '☐ ') +
      t('feature.ride.menu.prone') +
      (prone.refusal ? t(`feature.ride.menu.refusal_${prone.refusal}`) : ''),
    action: () => callbacks.setProne(!prone.on),
    enabled: prone.refusal === null,
  });
  const mount = model.mount;
  entries.push({
    name: (mount ? '☑ ' : '☐ ') + t('feature.ride.menu.mountable'),
    action: () => callbacks.setMountable(!mount),
  });
  if (mount) {
    entries.push({
      name: t('feature.ride.menu.settings'),
      action: undefined,
      subActions: [
        {
          name: (mount.passenger ? '☑ ' : '☐ ') + t('feature.ride.menu.passenger'),
          action: () => callbacks.setPassenger(!mount.passenger),
        },
        {
          name: t('feature.ride.menu.cargo'),
          action: undefined,
          subActions: CARGO_CHOICES.map((cargo) => ({
            name: (mount.cargo === cargo ? '✔ ' : '') + (cargo === 0 ? t('feature.ride.menu.cargoNone') : `${cargo}`),
            action: () => callbacks.setCargo(cargo),
          })),
        },
        {
          name: (mount.anyone ? '☑ ' : '☐ ') + t('feature.ride.menu.anyone'),
          action: () => callbacks.setAnyone(!mount.anyone),
        },
        {
          name: t('feature.ride.menu.seatHeight'),
          action: undefined,
          subActions: SEAT_HEIGHT_CHOICES.map((cells) => ({
            name:
              (mount.seatHeight === cells ? '✔ ' : '') +
              (cells === null
                ? t('feature.ride.menu.seatHeightDefault')
                : t('feature.ride.menu.seatHeightCells', { cells })),
            action: () => callbacks.setSeatHeight(cells),
          })),
        },
      ],
    });
  }
  return [...onAndOff, { name: t('feature.ride.menu.title'), action: undefined, subActions: entries }];
}
