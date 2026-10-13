import { TranslateFn } from '@axe/application/i18n/translate.token';
import { RideMenuModel } from '@axe/application/tabletop/ride.service';
import { ContextMenuAction } from '@axe/application/ui/context-menu.service';
import { RideSeat } from '@axe/domain/tabletop/ride/ride-rules';

/** What the riding entries of a piece's menu do. */
export interface RideMenuCallbacks {
  getOn(mountId: string, seat: RideSeat): void;
  getOff(): void;
  setMountable(mountable: boolean): void;
  setPassenger(passenger: boolean): void;
  setCargo(cargo: number): void;
  setAnyone(anyone: boolean): void;
  setSeatHeight(cells: number | null): void;
}

/** The riding entries of a piece's menu, in the two places they stand. */
export interface RideMenuEntries {
  /** Getting on a mount the piece stands on, or off the one it rides: offered with working a move out. */
  readonly onAndOff: ContextMenuAction[];
  /** Making the piece a mount and saying what it takes, gathered under one entry. */
  readonly group: ContextMenuAction[];
}

/** How many loads a mount may be set to carry. */
export const CARGO_CHOICES: readonly number[] = [0, 1, 2, 3, 4, 5, 6];

/** The heights a mount's riders may be set to stand at, in cells; null for half the mount's size. */
export const SEAT_HEIGHT_CHOICES: readonly (number | null)[] = [null, 0, 0.5, 1, 1.5, 2, 3];

/**
 * The riding entries of a piece's menu. Getting on a mount it stands on, in a seat free there, or
 * off the one it rides, are found at once beside working a move out; a seat the piece may not take,
 * and getting on or off where it has done so this turn, are shown with why and cannot be chosen, and
 * one it may take once it gets up from where it fell offers to get it up first. Making the piece a
 * mount, and what a mount takes, are gathered under one entry. That the piece has fallen over is
 * said with the rest of its state, in `buildConditionContextMenu`.
 *
 * Nothing for somebody who may not change the table.
 */
export function buildRideContextMenu(
  model: RideMenuModel,
  canEdit: boolean,
  callbacks: RideMenuCallbacks,
  t: TranslateFn
): RideMenuEntries {
  if (!canEdit) return { onAndOff: [], group: [] };
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
    for (const { seat, refusal, getsUp } of offer.seats) {
      const why = changeRefusal ?? (getsUp ? null : refusal);
      const label = getsUp ? `feature.ride.menu.upAndOn_${seat}` : `feature.ride.menu.on_${seat}`;
      onAndOff.push({
        name: t(label, { mount: offer.name }) + (why ? t(`feature.ride.menu.refusal_${why}`) : ''),
        action: () => callbacks.getOn(offer.id, seat),
        enabled: why === null,
      });
    }
  }
  const mount = model.mount;
  const entries: ContextMenuAction[] = [
    {
      name: (mount ? '☑ ' : '☐ ') + t('feature.ride.menu.mountable'),
      action: () => callbacks.setMountable(!mount),
    },
  ];
  if (mount) {
    entries.push(
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
      }
    );
  }
  return { onAndOff, group: [{ name: t('feature.ride.menu.title'), action: undefined, subActions: entries }] };
}
