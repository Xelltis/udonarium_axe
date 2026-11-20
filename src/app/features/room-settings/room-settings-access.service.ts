import { computed, inject, Injectable } from '@angular/core';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { RoomRulesService } from '@axe/application/tabletop/room-rules.service';
import {
  ROOM_SETTINGS,
  type RoomSettingKey,
  roomSettingOf,
  type RoomSettingSources,
  type RoomSettingValue,
  type RoomSettingWriter,
} from '@axe/application/tabletop/room-settings';
import { TabletopDisplayService } from '@axe/application/tabletop/tabletop-display.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { Config } from '@axe/domain/peer/config';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { RoomRules } from '@axe/domain/tabletop/room-rules';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { TabletopDisplaySettings } from '@axe/domain/tabletop/tabletop-display';
import { ZoneRules } from '@axe/domain/tabletop/zone/zone-rules';
import { DisplayCalibrationComponent } from '@axe/ui/components/display-calibration/display-calibration.component';

/** A setting as a form binds it: read afresh each time it is asked for, and written by its own rules. */
export interface SettingField<T> {
  value: T;
}

/**
 * What every part of the room settings reads the room through, and who may change what.
 *
 * Every read goes through the versions of what it reads, so a part drawn on push draws again when
 * the room, the table in view or this screen changes. Every write is turned away for a reader who
 * may not make it: the rules of play take being able to edit the table, and what every screen
 * shows takes being the master. A setting the room's config keeps is read and written as its entry
 * in {@link ROOM_SETTINGS} says, which is where who may write it is said. What this screen alone
 * shows needs nobody's leave.
 */
@Injectable({ providedIn: 'root' })
export class RoomSettingsAccessService {
  private readonly objectChange = inject(ObjectChangeService);
  private get tableSelecter(): TableSelecter {
    return TableSelecter.instance;
  }
  private readonly roomRules = inject(RoomRulesService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly display = inject(TabletopDisplayService);
  private readonly modalService = inject(ModalService);

  /** Whether this reader may not change the rules of play, which takes being able to edit the table. */
  readonly isReadOnly = computed(() => !this.rolePermission.canEditTabletop());

  /** The settings one screen changes for every screen, which only the master may. */
  readonly isSharedReadOnly = computed(() => !this.rolePermission.canEditShared());

  /**
   * Whether this reader may write something of the given writer's, for what the room settings change
   * that the room's config does not keep, as the table in view or the round.
   */
  mayWrite(writer: RoomSettingWriter): boolean {
    return writer === 'shared' ? !this.isSharedReadOnly() : !this.isReadOnly();
  }

  /** Whether this reader may write a setting of the room's config, as its entry in {@link ROOM_SETTINGS} says. */
  mayChange(key: RoomSettingKey): boolean {
    return this.mayWrite(ROOM_SETTINGS[key].writer);
  }

  /** What a setting is read from, each part read so that a change to it draws the part again. */
  private readonly sources: RoomSettingSources = {
    config: () => this.config(),
    rules: () => this.rules(),
    zone: () => this.zoneRules(),
  };

  /** The room's config, read so that a change to it draws the part again. */
  config(): Config {
    this.objectChange.versionOf('Config')();
    return Config.instance;
  }

  /** The table in view, read so that a change to it, or to which table is in view, draws the part again. */
  viewTable(): GameTable | null {
    this.objectChange.versionOf(this.tableSelecter.identifier)();
    const table = this.tableSelecter.viewTable;
    if (table) this.objectChange.versionOf(table.identifier)();
    return table;
  }

  /**
   * What the rules come to as they stand, whoever it is that rules them.
   *
   * The panel shows the answer that is in force rather than only what the room has said, so a rule
   * still left to the table reads as the table has it and editing it here is what hands it to the
   * room.
   */
  rules(): RoomRules {
    this.config();
    return this.roomRules.rulesFor(this.viewTable());
  }

  /** The engagement-zone rules in force: the room's answers, and the defaults for the rest. */
  zoneRules(): ZoneRules {
    this.config();
    return this.roomRules.zoneRules();
  }

  /** How the table seen from above is drawn on this screen: its own choices, then the table's. */
  displaySettings(): TabletopDisplaySettings {
    this.config();
    this.viewTable();
    return this.display.settingsNow();
  }

  /** A setting read and written by the functions given. */
  field<T>(read: () => T, write: (value: T) => void): SettingField<T> {
    return {
      get value() {
        return read();
      },
      set value(value: T) {
        write(value);
      },
    };
  }

  /**
   * A setting of the room's config, read and written as its entry in {@link ROOM_SETTINGS} says, and
   * written only by a reader the entry's writer lets.
   */
  setting<K extends RoomSettingKey>(key: K): SettingField<RoomSettingValue<K>> {
    const entry = roomSettingOf(key);
    return this.field(
      () => entry.read(this.sources),
      (value) => {
        if (this.mayChange(key)) entry.write(this.sources, value);
      }
    );
  }

  /** A setting this screen alone keeps, passed through `written` on the way in. */
  displayField<K extends keyof TabletopDisplaySettings>(
    key: K,
    written: (value: TabletopDisplaySettings[K]) => TabletopDisplaySettings[K] = (value) => value
  ): SettingField<TabletopDisplaySettings[K]> {
    return this.field(
      () => this.displaySettings()[key],
      (value) => this.display.set({ [key]: written(value) } as Partial<TabletopDisplaySettings>)
    );
  }

  /** Opens the dialog that measures this screen against an ID-1 card. */
  openCalibration(): void {
    // Without this the shell holds a fixed 800px and clips the frame the card is matched against.
    void this.modalService.open(DisplayCalibrationComponent, { fitWidth: true });
  }
}
