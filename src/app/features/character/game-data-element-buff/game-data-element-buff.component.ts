import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PieceNameService } from '@axe/application/character/piece-name.service';
import { StatusAilmentService } from '@axe/application/character/status-ailment.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { GameObjectInventoryService } from '@axe/application/inventory/game-object-inventory.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { debounce } from '@axe/core/util/debounce';
import { BUFF_COLORS, DEFAULT_BUFF_COLOR } from '@axe/domain/character/buff-appearance';
import {
  buffBadgeOf,
  buffColorOf,
  buffIconOf,
  buffIconUrlOf,
  parseBuffStrength,
} from '@axe/domain/character/buff-badge';
import { BUFF_KINDS, type BuffKind, buffKindOf, markBuffKind } from '@axe/domain/character/buff-kind';
import { readBuffModifier } from '@axe/domain/character/buff-modifier';
import {
  BUFF_EFFECT_TIMINGS,
  BUFF_TIMINGS,
  BuffEffectTiming,
  buffEffectTimingOf,
  buffExpires,
  BuffTiming,
  buffTimingOf,
  buffTriggerOf,
  writeBuffEffectTiming,
} from '@axe/domain/character/buff-timing';
import { buffTriggerOptions, selectedTriggerValue } from '@axe/domain/character/buff-trigger-options';
import { GameCharacter } from '@axe/domain/character/game-character';
import { owningCharacterOf } from '@axe/domain/character/owning-character';
import { DataElement, DataElementAttribute } from '@axe/domain/data/data-element';
import { BuffBadgeComponent } from '@axe/features/character/buff-badge/buff-badge.component';
import { loadFileSelecter } from '@axe/ui/components/file-selecter/file-selecter-loader';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { TranslocoModule } from '@jsverse/transloco';

@Component({
  selector: 'game-data-element-buff, [game-data-element-buff]',
  templateUrl: './game-data-element-buff.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BuffBadgeComponent, FormsModule, SafePipe, TranslocoModule],
  host: { '[attr.inert]': "isReadOnly() ? '' : null" },
})
export class GameDataElementBuffComponent {
  private readonly objectChange = inject(ObjectChangeService);
  private readonly vision = inject(VisionService);
  private readonly names = inject(PieceNameService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly inventory = inject(GameObjectInventoryService);
  private readonly modalService = inject(ModalService);
  private readonly t = inject(TRANSLATE_FN);
  private readonly statusAilments = inject(StatusAilmentService);

  readonly isReadOnly = computed(() => !this.rolePermission.canEditTabletop());

  readonly gameDataElement = input.required<DataElement>();
  readonly isEdit = input(false);
  readonly isTagLocked = input(false);
  readonly isValueLocked = input(false);
  readonly isPieceMode = input(false);

  /** How many children there are, following what is added and removed. */
  protected readonly childrenCount = computed<number>(() => {
    const element = this.gameDataElement();
    this.objectChange.versionOf(element.identifier)();
    return element.children.length;
  });

  /** The buff's name, value and current value as its element holds them, read through its version. */
  private readonly held = computed(() => {
    const element = this.gameDataElement();
    this.objectChange.versionOf(element.identifier)();
    return { name: element.name, value: element.value, currentValue: element.currentValue };
  });

  private readonly writeSoon = debounce(() => this.writeDrafts(), 66);
  /** Whether the drafts are being written now, when they are still held as a waiting write holds them. */
  private writing = false;

  /** Writes the drafts, holding them as drafts until they are written. */
  private writeDrafts(): void {
    this.writing = true;
    try {
      this.write();
    } finally {
      this.writing = false;
    }
  }

  /**
   * Whether the drafts in the row's boxes are kept as typed rather than following the element:
   * while a change typed into them waits to be written, the element still holds what was there.
   */
  private keepsDrafts(): boolean {
    return this.writing || this.writeSoon.pending();
  }

  private readonly _name = linkedSignal<{ name: string }, string>({
    source: this.held,
    computation: (held, previous) => (previous && this.keepsDrafts() ? previous.value : held.name),
  });
  /**
   * The buff's name as typed in the row, following the element whenever it changes.
   *
   * A write is held locally and reaches the synced element after a short pause, so each keystroke
   * does not send an update to the room.
   */
  get name(): string {
    return this._name();
  }
  set name(name: string) {
    this._name.set(name);
    this.writeSoon();
  }

  private readonly _value = linkedSignal<{ value: number | string }, number | string>({
    source: this.held,
    computation: (held, previous) => (previous && this.keepsDrafts() ? previous.value : held.value),
  });
  /** The buff's value field, written to the synced element after the same short pause as the name. */
  get value(): number | string {
    return this._value();
  }
  set value(value: number | string) {
    this._value.set(value);
    this.writeSoon();
  }

  private readonly _currentValue = linkedSignal<{ currentValue: number | string }, number | string>({
    source: this.held,
    computation: (held, previous) => (previous && this.keepsDrafts() ? previous.value : held.currentValue),
  });
  /**
   * The buff's current value, which is also the text its strength is read from.
   *
   * Written to the synced element after the same short pause as the name.
   */
  get currentValue(): number | string {
    return this._currentValue();
  }
  set currentValue(currentValue: number | string) {
    this._currentValue.set(currentValue);
    this.writeSoon();
  }

  readonly iconChoices = ['✦', '☠️', '🛡️', '⚔️', '🔥', '❄️', '💤', '💫', '🍀', '⛓️', '👁️', '💊'];

  readonly icon = computed(() => {
    const element = this.gameDataElement();
    this.objectChange.versionOf(element.identifier)();
    return buffIconOf(element);
  });

  /** Where the picture is, for a buff whose mark is one that was brought in, once it has arrived. */
  readonly iconUrl = computed(() => {
    this.objectChange.fileVersion();
    return buffIconUrlOf(this.icon());
  });

  readonly colorChoices = BUFF_COLORS;
  readonly defaultColor = DEFAULT_BUFF_COLOR;

  readonly color = computed(() => {
    const element = this.gameDataElement();
    this.objectChange.versionOf(element.identifier)();
    return buffColorOf(element);
  });

  readonly strength = computed(() => parseBuffStrength(`${this.currentValue ?? ''}`));

  readonly timingChoices = BUFF_TIMINGS;

  readonly timing = computed(() => {
    const element = this.gameDataElement();
    this.objectChange.versionOf(element.identifier)();
    return buffTimingOf(element);
  });

  /** The buff as the badge it is shown as over the piece, for the row of its details on the piece. */
  readonly badge = computed(() => {
    const element = this.gameDataElement();
    this.objectChange.versionOf(element.identifier)();
    this.objectChange.fileVersion();
    return buffBadgeOf(element);
  });

  /**
   * Whether time takes the buff away. A buff that never runs out is shown with ∞ for its rounds left,
   * since the count it holds never goes down.
   */
  readonly expires = computed(() => {
    const element = this.gameDataElement();
    this.objectChange.versionOf(element.identifier)();
    return buffExpires(element);
  });

  readonly trigger = computed(() => {
    const element = this.gameDataElement();
    this.objectChange.versionOf(element.identifier)();
    return buffTriggerOf(element);
  });

  readonly kindChoices = BUFF_KINDS;

  /**
   * Whether the buff is a buff or a debuff: as it is marked, or, unmarked, a debuff where it goes by
   * the name of a state the room keeps. A further row of a buff that moves several statuses is what
   * the buff's first row is.
   */
  readonly kind = computed<BuffKind>(() => {
    const element = this.gameDataElement();
    this.objectChange.versionOf(element.identifier)();
    for (const row of element.parent?.children ?? []) this.objectChange.versionOf(row.identifier)();
    return buffKindOf(element, this.statusAilments.ailments());
  });

  /**
   * Marks the buff a buff or a debuff by hand, and tells the room the element changed. Nothing for a
   * seat that may not edit the table.
   */
  selectKind(kind: BuffKind): void {
    if (this.isReadOnly()) return;
    const element = this.gameDataElement();
    markBuffKind(element, kind);
    this.objectChange.notifyChanged(element.identifier);
  }

  readonly effectTimingChoices = BUFF_EFFECT_TIMINGS;

  /** The moment the buff's effect moves at, where it has one of its own; empty where it has none. */
  readonly effectTiming = computed<BuffEffectTiming | ''>(() => {
    const element = this.gameDataElement();
    this.objectChange.versionOf(element.identifier)();
    return buffEffectTimingOf(element) ?? '';
  });

  /**
   * Whether there is a moment to choose for the buff's effect: it moves a status again at every
   * count, or it carries a moment already, which can then be taken away.
   */
  readonly canTimeEffect = computed(() => {
    const element = this.gameDataElement();
    this.objectChange.versionOf(element.identifier)();
    return readBuffModifier(element)?.step !== undefined || buffEffectTimingOf(element) !== null;
  });

  /**
   * The pieces a buff may be timed by, leaving out those on the table this reader cannot see and those
   * whose name is kept from them.
   */
  private readonly candidates = computed(() => {
    this.objectChange.collectionOf('character')();
    return (this.inventory.tableInventory.tabletopObjects as GameCharacter[])
      .filter((character) => this.vision.mayBeListed(character) && !this.names.isKept(character))
      .map((character) => ({ identifier: character.identifier, name: character.name }));
  });

  readonly triggerOptions = computed(() =>
    buffTriggerOptions(this.candidates(), this.trigger(), (name) =>
      this.t('feature.character.buff.triggerUnknown', { name })
    )
  );

  readonly triggerValue = computed(() => selectedTriggerValue(this.candidates(), this.trigger()));

  /**
   * Sets when the buff counts down, and tells the room the element changed.
   *
   * Counting at the round's end needs no character to key off, so any trigger set before is removed.
   */
  selectTiming(timing: BuffTiming): void {
    const element = this.gameDataElement();
    element.setAttribute(DataElementAttribute.BUFF_TIMING, timing);
    if (timing === 'roundEnd') element.removeAttribute(DataElementAttribute.BUFF_TRIGGER);
    this.objectChange.notifyChanged(element.identifier);
  }

  /**
   * Sets the moment the buff's effect moves at, and tells the room the element changed. An empty
   * choice takes it away, so the effect moves as the buff is counted down, or at the end of the round
   * for a buff that never is.
   */
  selectEffectTiming(timing: BuffEffectTiming | ''): void {
    const element = this.gameDataElement();
    writeBuffEffectTiming(element, timing);
    this.objectChange.notifyChanged(element.identifier);
  }

  /**
   * Names the character whose turn start or end the buff counts down on.
   *
   * A blank name removes the trigger, so the buff counts on its own character's turn.
   */
  setTrigger(name: string): void {
    const element = this.gameDataElement();
    const trimmed = name.trim();
    if (trimmed.length > 0) element.setAttribute(DataElementAttribute.BUFF_TRIGGER, trimmed);
    else element.removeAttribute(DataElementAttribute.BUFF_TRIGGER);
    this.objectChange.notifyChanged(element.identifier);
  }

  /** Gives the buff one of the offered marks; picking the mark it already has goes back to the default. */
  selectIcon(icon: string): void {
    const element = this.gameDataElement();
    if (buffIconOf(element) === icon) element.removeAttribute(DataElementAttribute.BUFF_ICON);
    else element.setAttribute(DataElementAttribute.BUFF_ICON, icon);
    this.objectChange.notifyChanged(element.identifier);
  }

  /** Puts a picture from the room's images in place of the mark. */
  async chooseIconImage(): Promise<void> {
    const identifier = await this.modalService.openLazy<string>(loadFileSelecter, { isAllowedEmpty: true });
    if (identifier == null) return;
    const element = this.gameDataElement();
    if (identifier.length > 0) element.setAttribute(DataElementAttribute.BUFF_ICON, identifier);
    else element.removeAttribute(DataElementAttribute.BUFF_ICON);
    this.objectChange.notifyChanged(element.identifier);
  }

  /** Gives the buff a badge colour; an empty colour, or the one it already has, goes back to the default. */
  selectColor(color: string): void {
    const element = this.gameDataElement();
    if (color.length < 1 || buffColorOf(element) === color) element.removeAttribute(DataElementAttribute.BUFF_COLOR);
    else element.setAttribute(DataElementAttribute.BUFF_COLOR, color);
    this.objectChange.notifyChanged(element.identifier);
  }

  private write(): void {
    const element = this.gameDataElement();
    if (element.name !== this.name) element.name = this.name;
    if (element.currentValue !== this.currentValue) element.currentValue = this.currentValue;
    if (element.value !== this.value) element.value = this.value;
  }

  /**
   * Takes a buff off, from the row's delete button.
   *
   * Removed through the character that holds it where there is one; a buff with no character above
   * it is simply destroyed.
   */
  deletBuff(data: DataElement) {
    const owner = owningCharacterOf(data);
    if (owner) owner.buffs.removeWhole(data);
    else data.destroy();
  }
}
