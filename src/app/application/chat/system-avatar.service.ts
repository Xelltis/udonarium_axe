import { computed, inject, Injectable, Signal } from '@angular/core';
import { ImageService } from '@axe/application/storage/image.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ImageFile } from '@axe/core/storage/image-file';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Config } from '@axe/domain/peer/config';

export const DEFAULT_SYSTEM_AVATAR_URL = 'assets/images/system_chang.webp';
export const DEFAULT_SYSTEM_DICE_AVATAR_URL = 'assets/images/system_chang_roll.webp';

export type SystemAvatarKind = 'system' | 'dice';

export const NO_SYSTEM_AVATAR = ImageFile.Empty.identifier;

@Injectable({ providedIn: 'root' })
export class SystemAvatarService {
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly imageService = inject(ImageService);

  readonly isVisible = computed<boolean>(() => this.readConfig()?.isSystemAvatarVisible ?? true);
  readonly isSpeakerVisible = computed<boolean>(() => this.readConfig()?.isSpeakerAvatarVisible ?? false);

  readonly systemUrl = computed<string>(() => this.urlOf('system'));
  readonly diceUrl = computed<string>(() => this.urlOf('dice'));

  readonly hasOwnSystemImage = computed<boolean>(() => this.identifierOf('system').length > 0);
  readonly hasOwnDiceImage = computed<boolean>(() => this.identifierOf('dice').length > 0);

  /** Whether the room has set its own picture for system notices or for dice results. */
  hasOwnImageOfKind(kind: SystemAvatarKind): Signal<boolean> {
    return kind === 'dice' ? this.hasOwnDiceImage : this.hasOwnSystemImage;
  }

  /**
   * The image the room set for this kind of notice, or empty when it uses the bundled one.
   *
   * The empty image's identifier means the room asked for no picture at all.
   */
  identifierOf(kind: SystemAvatarKind): string {
    const config = this.readConfig();
    if (!config) return '';
    return kind === 'dice' ? config.systemDiceAvatarIdentifier : config.systemAvatarIdentifier;
  }

  /** Sets the room's picture for this kind of notice, which is shared with every peer. */
  setImage(kind: SystemAvatarKind, identifier: string): void {
    const config = Config.instance;
    if (kind === 'dice') config.systemDiceAvatarIdentifier = identifier;
    else config.systemAvatarIdentifier = identifier;
    this.objectChange.notifyChanged(config.identifier);
  }

  /** Puts this kind of notice back on the bundled picture for the whole room. */
  resetImage(kind: SystemAvatarKind): void {
    this.setImage(kind, '');
  }

  /** Shows or hides the system's portrait beside notices, for the whole room. */
  setVisible(visible: boolean): void {
    const config = Config.instance;
    config.isSystemAvatarVisible = visible;
    this.objectChange.notifyChanged(config.identifier);
  }

  /** Shows or hides speakers' portraits beside their lines, for the whole room. */
  setSpeakerVisible(visible: boolean): void {
    const config = Config.instance;
    config.isSpeakerAvatarVisible = visible;
    this.objectChange.notifyChanged(config.identifier);
  }

  private readConfig(): Config | null {
    this.objectChange.collectionOf('config')();
    this.objectChange.versionOf('Config')();
    return this.objectStore.get<Config>('Config');
  }

  private urlOf(kind: SystemAvatarKind): string {
    this.objectChange.fileVersion();
    const identifier = this.identifierOf(kind);
    if (identifier === NO_SYSTEM_AVATAR) return '';
    const image = this.imageService.getEmptyOr(identifier);
    if (!image.isEmpty) return image.url;
    return kind === 'dice' ? DEFAULT_SYSTEM_DICE_AVATAR_URL : DEFAULT_SYSTEM_AVATAR_URL;
  }
}
