import { computed, inject, Injectable } from '@angular/core';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { RoomRulesService } from '@axe/application/tabletop/room-rules.service';
import { TabletopDisplayService } from '@axe/application/tabletop/tabletop-display.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { Config } from '@axe/domain/peer/config';
import { ConfigRuleAnswers } from '@axe/domain/peer/config-rule-answers';
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

/** Who may change a setting: whoever may edit the table, or only the master, for what every screen shows. */
export type SettingWriter = 'table' | 'shared';

/** The rules of play the panel offers as the rules in force have them, which the room can answer. */
type OfferedRule = keyof RoomRules & keyof Config;

/** The rules the room answers with a word, a number, or a yes or no. */
type AnswerOf<T> = { [Rule in keyof ConfigRuleAnswers]: ConfigRuleAnswers[Rule] extends T | null ? Rule : never };
type TextRule = AnswerOf<string>[keyof ConfigRuleAnswers];
type NumberRule = AnswerOf<number>[keyof ConfigRuleAnswers];
type FlagRule = AnswerOf<boolean>[keyof ConfigRuleAnswers];

/**
 * What every part of the room settings reads the room through, and who may change what.
 *
 * Every read goes through the versions of what it reads, so a part drawn on push draws again when
 * the room, the table in view or this screen changes. Every write is turned away for a reader who
 * may not make it: the rules of play take being able to edit the table, and what every screen
 * shows takes being the master. What this screen alone shows needs nobody's leave.
 */
@Injectable({ providedIn: 'root' })
export class RoomSettingsAccessService {
  private readonly objectChange = inject(ObjectChangeService);
  private readonly tableSelecter = inject(TableSelecter);
  private readonly roomRules = inject(RoomRulesService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly display = inject(TabletopDisplayService);
  private readonly modalService = inject(ModalService);

  /** Whether this reader may not change the rules of play, which takes being able to edit the table. */
  readonly isReadOnly = computed(() => !this.rolePermission.canEditTabletop());

  /** The settings one screen changes for every screen, which only the master may. */
  readonly isSharedReadOnly = computed(() => !this.rolePermission.canEditShared());

  /** Whether this reader may write a setting of the given writer's. */
  mayWrite(writer: SettingWriter): boolean {
    return writer === 'shared' ? !this.isSharedReadOnly() : !this.isReadOnly();
  }

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
   * A rule of play as the rules in force have it, which writing hands to the room as its own answer,
   * passed through `written` on the way.
   */
  ruleField<R extends OfferedRule>(
    rule: R,
    written: (value: RoomRules[R]) => Config[R] = (value) => value as Config[R],
    writer: SettingWriter = 'table'
  ): SettingField<RoomRules[R]> {
    return this.field(
      () => this.rules()[rule],
      (value) => {
        if (this.mayWrite(writer)) Config.instance[rule] = written(value);
      }
    );
  }

  /** A setting the config holds, read as it holds it, written by whoever the writer allows. */
  configField<K extends keyof Config>(
    key: K,
    writer: SettingWriter = 'table',
    written: (value: Config[K]) => Config[K] = (value) => value
  ): SettingField<Config[K]> {
    return this.field(
      () => this.config()[key],
      (value) => {
        if (this.mayWrite(writer)) Config.instance[key] = written(value);
      }
    );
  }

  /** A word the room answers with, empty while it has written none; an empty box takes the answer back. */
  answerText(rule: TextRule): SettingField<string> {
    return this.field(
      () => this.config()[rule] ?? '',
      (value) => {
        if (this.mayWrite('table')) Config.instance[rule] = value.trim().length > 0 ? value.trim() : null;
      }
    );
  }

  /**
   * A number the room answers with, shown as `shown` has it; a number the rule does not `take` hands
   * the answer back.
   */
  answerNumber(rule: NumberRule, shown: () => number, takes: (value: number) => boolean): SettingField<number> {
    return this.field(
      () => {
        this.config();
        return shown();
      },
      (value) => {
        if (this.mayWrite('table')) Config.instance[rule] = Number.isFinite(value) && takes(value) ? value : null;
      }
    );
  }

  /** A yes the room answers with; no takes the answer back. */
  answerYes(rule: FlagRule): SettingField<boolean> {
    return this.field(
      () => this.config()[rule] === true,
      (value) => {
        if (this.mayWrite('table')) Config.instance[rule] = value ? true : null;
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
