import { TranslateFn } from '@axe/application/i18n/translate.token';
import { ContextMenuAction } from '@axe/application/ui/context-menu.service';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';

export function buildLockToggleAction(
  isLocked: boolean,
  setLocked: (next: boolean) => void,
  t: TranslateFn
): ContextMenuAction {
  return isLocked
    ? {
        name: t('feature.tabletop.contextMenu.unlock'),
        action: () => {
          setLocked(false);
          SoundEffect.play(PresetSound.unlock);
        },
      }
    : {
        name: t('feature.tabletop.contextMenu.lock'),
        action: () => {
          setLocked(true);
          SoundEffect.play(PresetSound.lock);
        },
      };
}

/** An entry that only flips something on or off. Beyond the label, they all behave alike. */
export function buildToggleAction(
  isOn: boolean,
  setOn: (next: boolean) => void,
  labels: { on: string; off: string },
  onChanged?: () => void
): ContextMenuAction {
  return {
    name: isOn ? labels.on : labels.off,
    action: () => {
      setOn(!isOn);
      SoundEffect.play(PresetSound.sweep);
      onChanged?.();
    },
  };
}

export interface AltitudeActionOptions {
  /** Reset the altitude only, leaving the offset from the board alone. */
  keepPosZ?: boolean;
  onChanged?: () => void;
  /** Entries only this object needs, such as turning its shadow on and off. */
  extraActions?: ContextMenuAction[];
}

/** Height works the same for a piece as for terrain: reset it, or show the number. */
export function buildAltitudeAction(
  target: TabletopObject,
  t: TranslateFn,
  options: AltitudeActionOptions = {}
): ContextMenuAction {
  return {
    name: t('feature.tabletop.contextMenu.altitudeSetting'),
    action: undefined,
    subActions: [
      {
        name: t('feature.tabletop.contextMenu.altitudeZero'),
        action: () => {
          if (target.altitude === 0 && (options.keepPosZ || target.posZ === 0)) return;
          target.altitude = 0;
          if (!options.keepPosZ) target.posZ = 0;
          SoundEffect.play(PresetSound.sweep);
        },
        altitudeHandle: target,
      },
      buildToggleAction(
        target.isAltitudeIndicate,
        (next) => (target.isAltitudeIndicate = next),
        {
          on: t('feature.tabletop.contextMenu.altitudeShowOn'),
          off: t('feature.tabletop.contextMenu.altitudeShowOff'),
        },
        options.onChanged
      ),
      ...(options.extraActions ?? []),
    ],
  };
}

export interface CopyActionOptions<T extends TabletopObject> {
  readonly sound?: string;
  readonly afterClone?: (clone: T) => void;
}

/** A copy of a piece, put down one cell along from it and hung where the original hangs. */
export function copyBeside<T extends TabletopObject>(obj: T, gridSize: number, afterClone?: (clone: T) => void): T {
  const copy = obj.clone();
  if (copy.location) {
    copy.location.x += gridSize;
    copy.location.y += gridSize;
  }
  afterClone?.(copy);
  // A copy is built from the original's own xml, which says nothing of what it hangs from.
  // Anything the table keeps as a child of its own is nowhere until it is hung there too.
  obj.parent?.appendChild(copy);
  copy.update();
  return copy;
}

export function buildCopyAction<T extends TabletopObject>(
  obj: T,
  gridSize: number,
  t: TranslateFn,
  options: CopyActionOptions<T> = {}
): ContextMenuAction {
  const { sound = PresetSound.piecePut, afterClone } = options;
  return {
    name: t('feature.tabletop.contextMenu.copy'),
    action: () => {
      copyBeside(obj, gridSize, afterClone);
      SoundEffect.play(sound);
    },
  };
}
