import { computed, inject, Injectable } from '@angular/core';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import {
  OPEN_STAMP_RULES,
  stampAllowed,
  StampRules,
  StampUse,
  stampUseOn,
  withStampsAllowed,
  withStampUseOn,
} from '@axe/domain/chat/stamp-rules';
import { Config } from '@axe/domain/peer/config';

/**
 * What the room lets its stamps be used for, followed as it changes: sent as a line, and put on a
 * line as a reaction. The rules are shared with the room, and only the game master may change them,
 * as with the room's other shared settings.
 */
@Injectable({ providedIn: 'root' })
export class StampRulesService {
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly rolePermission = inject(RolePermissionService);

  /**
   * The room's rules as they stand, every stamp for everything before the room's settings exist;
   * read where things are drawn, the drawing follows them as they change.
   */
  rules(): StampRules {
    this.objectChange.versionOf('Config')();
    return this.objectStore.get<Config>('Config')?.stampRules ?? OPEN_STAMP_RULES;
  }

  /** Whether this reader may change the rules, which only the game master may. */
  readonly canChange = computed(() => {
    this.objectChange.trackMyCursor();
    return this.rolePermission.canEditShared;
  });

  /** Whether a use is on at all. */
  isOn(use: StampUse): boolean {
    return stampUseOn(this.rules(), use);
  }

  /** Whether a stamp may be used this way now. */
  allows(use: StampUse, stampId: string): boolean {
    return stampAllowed(this.rules(), use, stampId);
  }

  /** Turns a use on or off for everyone. Anyone but the game master is refused. */
  setOn(use: StampUse, on: boolean): void {
    const config = this.editableConfig();
    if (config) config.stampRules = withStampUseOn(config.stampRules, use, on);
  }

  /** Allows or denies some stamps a use for everyone. Anyone but the game master is refused. */
  setAllowed(use: StampUse, stampIds: readonly string[], allowed: boolean): void {
    const config = this.editableConfig();
    if (config) config.stampRules = withStampsAllowed(config.stampRules, use, stampIds, allowed);
  }

  private editableConfig(): Config | null {
    if (!this.rolePermission.canEditShared) return null;
    return this.objectStore.get<Config>('Config') ?? null;
  }
}
