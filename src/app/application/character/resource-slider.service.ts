import { computed, inject, Injectable } from '@angular/core';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { resourceElementsOf } from '@axe/domain/character/resource-catalog';
import { showsResourceSlider } from '@axe/domain/character/resource-slider';
import { DataElement, DataElementAttribute } from '@axe/domain/data/data-element';
import { Config } from '@axe/domain/peer/config';

/**
 * Which number resources are moved with a slider: each by its own choice, or by the room's where it
 * made none, and every one of a piece at once.
 */
@Injectable({ providedIn: 'root' })
export class ResourceSliderService {
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly rolePermission = inject(RolePermissionService);

  /** Whether a number resource that says nothing of its own slider shows one, for the whole room. */
  readonly roomDefault = computed<boolean>(() => {
    this.objectChange.collectionOf('config')();
    this.objectChange.versionOf('Config')();
    return this.objectStore.get<Config>('Config')?.resourceSliderByDefault ?? false;
  });

  /** Shows a slider on every number resource that says nothing of its own, or on none, for the whole room. */
  setRoomDefault(shown: boolean): void {
    const config = Config.instance;
    config.resourceSliderByDefault = shown;
    this.objectChange.notifyChanged(config.identifier);
  }

  /** Whether a resource is moved with a slider, by its own choice or the room's. */
  shows(element: DataElement): boolean {
    this.objectChange.versionOf(element.identifier)();
    return showsResourceSlider(element, this.roomDefault());
  }

  /** Whether this seat may give every resource of the piece a slider or take them all away. */
  maySetAll(character: GameCharacter): boolean {
    return this.rolePermission.canEditTabletop() && resourceElementsOf(character).length > 0;
  }

  /**
   * Gives every resource of the piece a slider, or takes every one away, whatever the room's
   * default, for a seat that may.
   */
  setAll(character: GameCharacter, shown: boolean): void {
    if (!this.rolePermission.canEditTabletop()) return;
    for (const element of resourceElementsOf(character)) {
      element.setAttribute(DataElementAttribute.RESOURCE_SLIDER, shown ? 'true' : 'false');
      this.objectChange.notifyChanged(element.identifier);
    }
  }
}
