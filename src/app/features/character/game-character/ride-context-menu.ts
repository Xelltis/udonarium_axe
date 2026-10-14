import { TranslateFn } from '@axe/application/i18n/translate.token';
import { RideMenuModel } from '@axe/application/tabletop/ride.service';
import { ContextMenuAction, ContextMenuSeparator } from '@axe/application/ui/context-menu.service';
import { readSeatHeight, RideSeat, seatHeightFieldOf } from '@axe/domain/tabletop/ride/ride-rules';

/** What the riding entries of a piece's menu do. */
export interface RideMenuCallbacks {
  getOn(mountId: string, seat: RideSeat): void;
  getOff(): void;
  setMountable(mountable: boolean): void;
  setPassenger(passenger: boolean): void;
  setCargo(cargo: number): void;
  setAnyone(anyone: boolean): void;
  setSeatHeight(written: string): void;
  /** Opens where a mount's seat height is typed as any number. */
  editSeatHeight(): void;
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

/** The parts of a mount's height its riders may be set to stand at, as written down. */
export const SEAT_SHARE_CHOICES: readonly string[] = ['25%', '50%', '75%', '100%'];

/** The heights a mount's riders may be set to stand at in cells, as written down. */
export const SEAT_CELL_CHOICES: readonly string[] = ['0', '0.5', '1', '1.5', '2', '3'];

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
    const seatChoice = (written: string, label: string): ContextMenuAction => ({
      name: (mount.seatHeight === written ? '✔ ' : '') + label,
      action: () => callbacks.setSeatHeight(written),
    });
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
        subActions: [
          seatChoice('', t(`feature.ride.menu.seatHeightDefault_${mount.seatDefault}`)),
          ...SEAT_SHARE_CHOICES.map((share) =>
            seatChoice(share, t(`feature.ride.menu.seatHeightShare_${share.replace('%', '')}`))
          ),
          ContextMenuSeparator,
          ...SEAT_CELL_CHOICES.map((cells) => seatChoice(cells, t('feature.ride.menu.seatHeightCells', { cells }))),
          ContextMenuSeparator,
          customSeatHeight(mount.seatHeight, callbacks, t),
        ],
      }
    );
  }
  return { onAndOff, group: [{ name: t('feature.ride.menu.title'), action: undefined, subActions: entries }] };
}

/**
 * The entry for typing a mount's seat height as any number, marked with the height it is set to
 * where that is none of the heights offered.
 */
function customSeatHeight(written: string, callbacks: RideMenuCallbacks, t: TranslateFn): ContextMenuAction {
  const offered = written === '' || SEAT_SHARE_CHOICES.includes(written) || SEAT_CELL_CHOICES.includes(written);
  const field = offered ? null : seatHeightFieldOf(readSeatHeight(written));
  const action = () => callbacks.editSeatHeight();
  if (!field) return { name: t('feature.ride.menu.seatHeightCustom'), action };
  const value =
    field.unit === 'px'
      ? `${field.value}px`
      : field.unit === 'percent'
        ? t('feature.ride.menu.seatHeightPercent', { percent: field.value })
        : t('feature.ride.menu.seatHeightCells', { cells: field.value });
  return { name: '✔ ' + t('feature.ride.menu.seatHeightCustomSet', { value }), action };
}
