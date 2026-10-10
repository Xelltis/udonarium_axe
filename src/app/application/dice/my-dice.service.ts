import { inject, Injectable, InjectionToken, signal } from '@angular/core';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { DiceImageStore } from '@axe/core/storage/dice-image-store';
import { downscaleImageBlob } from '@axe/core/storage/image-downscale';
import { ImageFile, ImageState } from '@axe/core/storage/image-file';
import { looksLikeImage } from '@axe/core/storage/image-sniff';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { asDiceLook, DiceLook, DicePictureFit, PLAIN_DICE_LOOK } from '@axe/domain/dice/dice-3d/dice-look';

const STORAGE_KEY = 'my-dice';

/** The largest a dice picture may be once resampled, on its longer side: a die is never drawn larger. */
export const DICE_PICTURE_MAX_SIDE = 512;
/** The largest file taken in at all, before anything is decoded. */
export const DICE_PICTURE_MAX_BYTES = 8 * 1024 * 1024;

/** Why a picture offered for the dice was not taken. */
export type DicePictureTrouble = 'notPicture' | 'tooLarge' | 'unstored' | 'notAllowed';

/** Makes a picture ready to put on the dice: resampled down and written out small. */
export const DICE_PICTURE_PREPARER = new InjectionToken<(picture: Blob) => Promise<Blob>>('DICE_PICTURE_PREPARER', {
  providedIn: 'root',
  factory: () => async (picture) => (await downscaleImageBlob(picture, DICE_PICTURE_MAX_SIDE)) ?? picture,
});

/**
 * How this seat's dice look. Every line the seat says carries it, so everyone sees its rolls thrown
 * in it, and the dice bot's answer to a roll carries it on.
 *
 * It is the person's, not the room's or a character's: kept in this browser, and the same whoever
 * the seat speaks as. A picture for the dice is shared through the room's images, which start
 * empty with every visit, so it is kept here too and put back into them when it is next needed:
 * as the seat speaks, or opens the panel it is chosen in. Not before, since the seat's role is not
 * known until it has joined a room, and a guest's picture must stay out of it.
 */
@Injectable({ providedIn: 'root' })
export class MyDiceService {
  private readonly prepare = inject(DICE_PICTURE_PREPARER);
  private readonly permission = inject(RolePermissionService);
  private readonly pictures = DiceImageStore.instance;
  private readonly current = signal<DiceLook>(storedLook());
  private restoring: Promise<void> | null = null;

  readonly look = this.current.asReadonly();

  /** Chooses a look, kept for the next visit where the browser allows. */
  set(look: DiceLook): void {
    const tidy = asDiceLook(look);
    this.current.set(tidy);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tidy));
    } catch {
      // Private browsing refuses the write; the look still holds for this session.
    }
  }

  /**
   * Puts a picture on this seat's dice in place of any before it, whose copy in this browser is let
   * go. It is checked to be a picture and not too large, resampled down, kept in this browser and
   * only then shared through the room's images, so one this browser cannot keep is shared with no
   * one. A guest, who may not add to the room's images, is turned away. Says what was wrong with it,
   * or null when it was taken.
   */
  async setPicture(file: Blob): Promise<DicePictureTrouble | null> {
    if (!this.permission.canEditTabletop) return 'notAllowed';
    if (file.size > DICE_PICTURE_MAX_BYTES) return 'tooLarge';
    if (!(await looksLikeImage(file))) return 'notPicture';
    const image = await ImageFile.createAsync(await this.prepare(file));
    const bytes = image.blob;
    if (!bytes || !(await this.pictures.put(image.identifier, bytes))) {
      image.destroy();
      return 'unstored';
    }
    ImageStorage.instance.add(image);
    const before = this.look().picture;
    this.set({ ...this.look(), picture: image.identifier });
    if (before && before !== image.identifier) void this.pictures.remove(before);
    return null;
  }

  /** Takes the picture off this seat's dice, letting go of the copy this browser kept. */
  removePicture(): void {
    const picture = this.look().picture;
    if (!picture) return;
    this.set({ ...this.look(), picture: '' });
    void this.pictures.remove(picture);
  }

  /** Chooses how the picture is put on the dice. */
  setPictureFit(pictureFit: DicePictureFit): void {
    this.set({ ...this.look(), pictureFit });
  }

  /**
   * Puts this seat's dice picture back among the room's images where it is missing, as on a fresh
   * visit, from the bytes this browser kept, so it comes back under the same identifier. A seat
   * sitting as a guest, who may not add to the room's images, leaves them alone.
   */
  ensureShared(): Promise<void> {
    const picture = this.look().picture;
    if (!picture || !this.permission.canEditTabletop) return Promise.resolve();
    const held = ImageStorage.instance.get(picture);
    if (held && ImageState.COMPLETE <= held.state) return Promise.resolve();
    this.restoring ??= this.restore(picture).finally(() => (this.restoring = null));
    return this.restoring;
  }

  private async restore(picture: string): Promise<void> {
    const bytes = await this.pictures.get(picture);
    if (!bytes) return;
    const named = new File([bytes], `${picture}.${extensionOf(bytes.type)}`, { type: bytes.type });
    await ImageStorage.instance.addAsync(named);
  }
}

function storedLook(): DiceLook {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? asDiceLook(JSON.parse(raw)) : PLAIN_DICE_LOOK;
  } catch {
    return PLAIN_DICE_LOOK;
  }
}

/** The file ending that keeps a picture's identifier when it is read back in. */
function extensionOf(type: string): string {
  switch (type) {
    case 'image/png':
      return 'png';
    case 'image/jpeg':
      return 'jpg';
    case 'image/gif':
      return 'gif';
    default:
      return 'webp';
  }
}
