import { inject, Injectable } from '@angular/core';
import { ImageStorage } from '@axe/core/storage/image-storage';
import type { GameCharacter } from '@axe/domain/character/game-character';
import { addShownPortrait } from '@axe/domain/character/shown-portrait';

/**
 * Makes a picture of a piece's model, as it is set up, one of the piece's portraits: the picture is
 * held here and shared as any picture added is, and the piece shows it wherever its picture is
 * shown, in the chat, on its card and in the lists, while the portraits it had are kept.
 */
@Injectable({ providedIn: 'root' })
export class ModelPortraitService {
  private readonly images = inject(ImageStorage);

  /** Adds a picture as the portrait a piece shows, named as given; answers whether it was added. */
  async addShown(character: GameCharacter, picture: Blob, name: string): Promise<boolean> {
    const image = await this.images.addAsync(picture);
    if (!image) return false;
    return addShownPortrait(character, image.identifier, name) !== null;
  }
}
