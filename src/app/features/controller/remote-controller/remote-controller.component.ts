import { NgClass, NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CharacterMacroService } from '@axe/application/chat/character-macro.service';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { DiceBotCatalogService } from '@axe/application/dice/dice-bot-catalog.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { GameObjectInventoryService } from '@axe/application/inventory/game-object-inventory.service';
import { DisclosureService } from '@axe/application/permission/disclosure.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { PanelOption, PanelService } from '@axe/application/ui/panel.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { ViewportService } from '@axe/application/ui/viewport.service';
import { getMyPeerId } from '@axe/core/network/peer-context-source';
import { ObjectStore } from '@axe/core/sync/object-store';
import { BUFF_COLORS, resolveBuffColor } from '@axe/domain/character/buff-appearance';
import { ControllerResourcePick, controllerShowsResource } from '@axe/domain/character/controller-resource-pick';
import { GameCharacter } from '@axe/domain/character/game-character';
import { type ResourceCatalogEntry, resourceCatalogOf } from '@axe/domain/character/resource-catalog';
import { isChangeableElementType } from '@axe/domain/character/status-accessor';
import { ChatPalette } from '@axe/domain/chat/chat-palette';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { PaletteRow, paletteRowsOf } from '@axe/domain/chat/palette-rows';
import { DataElement } from '@axe/domain/data/data-element';
import { DataSummarySetting, SortOrder } from '@axe/domain/data/data-summary-setting';
import { RESOURCE_SLOTS, type ResourceSlot } from '@axe/domain/data/resource-slot';
import { DiceBot } from '@axe/domain/dice/dice-bot';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import { ControllerInputComponent } from '@axe/features/controller/controller-input/controller-input.component';
import {
  addBuffRound,
  decreaseBuffRound,
  deleteZeroRoundBuffs,
  parseBuffInput,
  RemoteControllerSelect,
} from '@axe/features/controller/remote-controller/remote-controller-buff';
import {
  getGameObjects,
  getInventory,
  getInventoryTags,
  getTabTitleKey,
  getTargetCharacters,
} from '@axe/features/controller/remote-controller/remote-controller-helpers';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { TranslocoModule } from '@jsverse/transloco';
import GameSystemClass from 'bcdice/lib/game_system';

export type MobileSection = 'targets' | 'buff' | 'resource';

const SLOT_LABEL_KEYS: Record<ResourceSlot, string> = {
  now: 'feature.controller.remote.slotNow',
  max: 'feature.controller.remote.slotMax',
  maxBase: 'feature.controller.remote.slotMaxBase',
  maxCorrection: 'feature.controller.remote.slotMaxCorrection',
  minBase: 'feature.controller.remote.slotMinBase',
  minCorrection: 'feature.controller.remote.slotMinCorrection',
};

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'remote-controller',
  templateUrl: './remote-controller.component.html',
  imports: [FormsModule, ControllerInputComponent, NgClass, NgTemplateOutlet, SafePipe, TranslocoModule],
})
export class RemoteControllerComponent {
  protected readonly isCompact = inject(ViewportService).isCompact;
  readonly chatMessageService = inject(ChatMessageService);
  private readonly characterMacro = inject(CharacterMacroService);
  private readonly panelService = inject(PanelService);
  private readonly inventoryService = inject(GameObjectInventoryService);
  private readonly disclosureService = inject(DisclosureService);
  private readonly pointerDeviceService = inject(PointerDeviceService);
  private readonly objectStore = inject(ObjectStore);
  private readonly selectionSignalService = inject(SelectionSignalService);
  private readonly uiSignalService = inject(UiSignalService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly t = inject(TRANSLATE_FN);

  /**
   * The translated name of a part of a resource, such as its current or maximum value, for the slot
   * buttons.
   */
  slotLabel(slot: ResourceSlot): string {
    return this.t(SLOT_LABEL_KEYS[slot]);
  }

  /**
   * The selected character's remote controller palette, whose lines fill the palette list; null
   * before a character is chosen.
   */
  get palette(): ChatPalette | null {
    return this.character()?.remoteController ?? null;
  }

  private _gameSystem!: GameSystemClass;

  /**
   * The id of the dice bot loaded for the panel, empty until one has loaded.
   *
   * Setting it loads that game system in the background and stores its id on the selected
   * character's remote controller palette once it arrives.
   */
  get gameType(): string {
    return this._gameSystem == null ? '' : this._gameSystem.ID;
  }
  set gameType(gameType: string) {
    DiceBot.loadGameSystemAsync(gameType).then((gameSystem) => {
      this._gameSystem = gameSystem;
      const char = this.character();
      if (char?.remoteController) {
        char.remoteController.dicebot = gameSystem.ID;
      }
    });
  }

  /**
   * The identifier of the character the panel works for; setting it switches the panel to that
   * character.
   */
  get sendFrom(): string {
    return this.character()?.identifier ?? '';
  }
  set sendFrom(sendFrom: string) {
    this.onSelectedCharacter(sendFrom);
  }

  private readonly diceBotCatalog = inject(DiceBotCatalogService);

  /** Every dice bot the app knows, as the catalog lists them. */
  get diceBotInfos() {
    return this.diceBotCatalog.infos();
  }

  readonly chatTab = computed(() => {
    this.objectChange.versionOf(this.chatTabidentifier())();
    this.objectChange.collectionOf('chat-tab')();
    return this.objectStore.get<ChatTab>(this.chatTabidentifier())!;
  });

  readonly chatTabsVersion = computed(() => {
    this.objectChange.collectionOf('chat-tab')();
    this.objectChange.versionOf(ChatTabList.instance.identifier)();
    const tabs = this.chatMessageService.chatTabs;
    for (const tab of tabs) this.objectChange.versionOf(tab.identifier)();
    return [...tabs];
  });
  /** This user's own cursor. */
  get myPeer(): PeerCursor {
    return PeerCursor.myCursor;
  }
  /** Every peer cursor in the room. */
  get otherPeers(): PeerCursor[] {
    return this.objectStore.getObjects(PeerCursor);
  }

  constructor() {
    queueMicrotask(() => this.updatePanelTitle());
    this.chatTabidentifier.set(this.chatMessageService.chatTabs[0]?.identifier ?? '');
    effect(() => {
      const dicebot = this.character()?.remoteController?.dicebot ?? '';
      if (0 < dicebot.length) {
        untracked(() => (this.gameType = dicebot));
      }
    });
    effect(() => {
      this.counterChoices();
      untracked(() => this.dropChosenIfGone());
    });
    this.objectChange.objectDeleted$.subscribe((e) => {
      if (this.character() && this.character()!.identifier === e.identifier) {
        this.panelService.close();
      }
      if (this.chatTabidentifier() === e.identifier) {
        this.chatTabidentifier.set(this.chatMessageService.chatTabs[0]?.identifier ?? '');
      }
    }, this.destroyRef);
    this.objectChange.networkOpen$.subscribe(() => {
      this.inventoryTypes.set(['table', 'common', getMyPeerId(), 'graveyard']);
      if (!this.inventoryTypes().includes(this.selectTab())) {
        this.selectTab.set(getMyPeerId());
      }
    }, this.destroyRef);
    this.inventoryTypes.set(['table', 'common', getMyPeerId(), 'graveyard']);
    this.destroyRef.onDestroy(() => {
      if (this.isEdit()) this.toggleEditMode();
    });
  }

  /** The name of the data item the room's inventory is sorted by. */
  get sortTag(): string {
    return this.inventoryService.sortTag;
  }
  set sortTag(sortTag: string) {
    this.inventoryService.sortTag = sortTag;
  }
  /** Whether the room's inventory sorts ascending or descending. */
  get sortOrder(): SortOrder {
    return this.inventoryService.sortOrder;
  }
  set sortOrder(sortOrder: SortOrder) {
    this.inventoryService.sortOrder = sortOrder;
  }
  /** The display items the room's inventory list shows, as typed. */
  get dataTag(): string {
    return this.inventoryService.dataTag;
  }
  set dataTag(dataTag: string) {
    this.inventoryService.dataTag = dataTag;
  }
  /** The room's inventory display items, one name each. */
  get dataTags(): string[] {
    return this.inventoryService.dataTags;
  }

  /** The translated name of the inventory's current sort direction. */
  get sortOrderName(): string {
    return this.sortOrder === SortOrder.ASC
      ? this.t('feature.inventory.list.sortAsc')
      : this.t('feature.inventory.list.sortDesc');
  }

  /** The display item name that stands for a line break in a row of the target list. */
  get newLineString(): string {
    return this.inventoryService.newLineString;
  }
  readonly controllerInputComponent = viewChild.required<ControllerInputComponent>('controllerInput');
  readonly paletteListRef = viewChild<ElementRef<HTMLDivElement>>('paletteList');
  readonly character = signal<GameCharacter | null>(null);

  readonly selectedLine = signal<number>(-1);

  readonly paletteRows = computed((): PaletteRow[] => {
    const char = this.character();
    const palette = char?.remoteController ?? null;
    if (!palette) return [];
    this.objectChange.versionOf(palette.identifier)();
    return paletteRowsOf(palette.getPalette());
  });

  errorMessageBuff = '';
  errorMessageController = '';

  readonly text = signal('');

  readonly buffAreaIsHide = signal(false);
  readonly controllerAreaIsHide = signal(false);

  readonly buffSectionOpen = signal(true);
  readonly buffColors = BUFF_COLORS;
  readonly buffColorId = signal('');
  readonly counterSectionOpen = signal(true);

  readonly chatTabidentifier = signal('');
  remoteNumber = 0;

  recoveryLimitFlag = false;
  recoveryLimitFlagMin = false;
  readonly remoteControllerSelect = signal<RemoteControllerSelect>({ name: '', nowOrMax: 'now', dispName: '' });
  readonly isEdit = signal(false);
  editPalette = '';

  private doubleClickTimer: ReturnType<typeof setTimeout> | null = null;

  readonly inventoryTypes = signal<string[]>(['table', 'common', 'graveyard']);
  readonly selectTab = signal('table');

  readonly mobileSection = signal<MobileSection>('targets');
  protected readonly mobileSections: readonly { readonly id: MobileSection; readonly labelKey: string }[] = [
    { id: 'targets', labelKey: 'feature.controller.remote.mobileTargetsTab' },
    { id: 'buff', labelKey: 'feature.controller.remote.mobileBuffTab' },
    { id: 'resource', labelKey: 'feature.controller.remote.mobileResourceTab' },
  ];

  protected targetNames(): string {
    return this.getTargetCharacters(true)
      .map((character) => character.name)
      .join('、');
  }

  /** Flips the sign of the amount the change button adds, from the plus-minus button. */
  reverseValue() {
    this.remoteNumber = -this.remoteNumber;
  }

  /** Picks the colour the next buff is given; picking the colour already chosen clears it. */
  selectBuffColor(id: string): void {
    this.buffColorId.update((current) => (current === id ? '' : id));
  }

  /**
   * Puts the buff typed into the buff field on every ticked target and announces it in the chat,
   * from Enter or the add button.
   *
   * A colour chosen in the panel is added unless the typed line names one. Empty text does nothing,
   * and with no ticked target an error is shown instead.
   */
  sendBuffChat(event: KeyboardEvent | null): void {
    if (event) event.preventDefault();
    const textVal = this.text().trim();
    if (!textVal) return;
    const parsed = parseBuffInput(textVal);
    if (!parsed) return;
    const gameCharacters = this.getTargetCharacters(true);
    if (gameCharacters.length <= 0) {
      this.errorMessageBuff = this.t('feature.controller.remote.noTarget');
      return;
    }
    const ci = this.controllerInputComponent();
    const parts = gameCharacters.map((o) => `[${o.name}]`).join('');
    const appearance = { ...parsed.appearance };
    let bufftext = parsed.bufftext;
    if (appearance.color === undefined && this.buffColorId().length > 0) {
      appearance.color = resolveBuffColor(this.buffColorId());
      bufftext += `/${this.buffColorId()}`;
    }
    addBuffRound(gameCharacters, parsed.buffname, parsed.sub, parsed.round, appearance);
    this.announce(this.t('feature.controller.remote.addBuffMessage', { buff: bufftext, targets: parts }), {
      portraitIndex: ci.portraitIndex(),
      color: ci.selectChatColor,
    });
    this.errorMessageBuff = '';
    this.text.set('');
  }

  /**
   * Points the change buttons at a data item and the part of it they move, with the name the chat
   * line calls it by.
   */
  remoteSelect(name: string, nowOrMax: ResourceSlot, dispName: string) {
    this.remoteControllerSelect.set({ name, nowOrMax, dispName });
  }

  /** Whether this is the item the buttons are pointing at. */
  isChosenName(name: string): boolean {
    return this.remoteControllerSelect().name === name;
  }

  /** Whether this is the part of it they would move. */
  isChosenSlot(slot: ResourceSlot): boolean {
    return this.remoteControllerSelect().nowOrMax === slot;
  }

  /**
   * Points the buttons at an item.
   *
   * The slot stays where it stood, so a table working through a row of pieces keeps moving
   * the same part of each; an item that has only its value to write to takes that.
   */
  chooseResource(choice: ResourceCatalogEntry): void {
    const slot = choice.isResource ? this.remoteControllerSelect().nowOrMax : 'now';
    this.remoteSelect(choice.name, slot, this.displayNameOf(choice, slot));
  }

  /**
   * Switches which part of the chosen item the change buttons move; does nothing before an item is
   * chosen.
   */
  chooseSlot(slot: ResourceSlot): void {
    const choice = this.chosenChoice();
    if (!choice) return;
    this.remoteSelect(choice.name, slot, this.displayNameOf(choice, slot));
  }

  /** How the operation reads in the chat line: the item, and which part of it was moved. */
  private displayNameOf(choice: ResourceCatalogEntry, slot: ResourceSlot): string {
    if (!choice.isResource) return choice.name;
    return `${choice.name}${this.t('feature.controller.remote.slotNameSeparator')}${this.slotLabel(slot)}`;
  }

  /**
   * Names the selected character in the panel's title, or shows the plain title when none is
   * selected.
   */
  updatePanelTitle() {
    const char = this.character();
    this.panelService.title = char
      ? this.t('feature.controller.remote.panelTitleWithName', { name: char.name })
      : this.t('feature.controller.remote.panelTitle');
  }

  /**
   * Switches the panel to the character with this identifier and loads its dice bot.
   *
   * A character this user may not view is ignored. Palette editing in progress is finished first,
   * which saves the edited text.
   */
  onSelectedCharacter(identifier: string) {
    const object = this.objectStore.get(identifier);
    if (object instanceof GameCharacter && !this.disclosureService.canView(object)) return;
    if (this.isEdit()) {
      this.toggleEditMode();
    }
    if (object instanceof GameCharacter) {
      this.character.set(object);
      const gameType = object.remoteController ? object.remoteController.dicebot : '';
      if (0 < gameType.length) {
        this.gameType = gameType;
      }
    }
    this.updatePanelTitle();
  }

  /** Puts a palette line into the buff field. */
  selectPalette(line: string) {
    this.text.set(line);
  }

  /**
   * Puts a palette line into the buff field; clicking the same line again within 400ms sends it as
   * a buff.
   */
  clickPalette(line: string) {
    if (this.doubleClickTimer && this.text() === line) {
      clearTimeout(this.doubleClickTimer);
      this.doubleClickTimer = null;
      this.sendBuffChat(null);
    } else {
      this.text.set(line);
      this.doubleClickTimer = setTimeout(() => {
        this.doubleClickTimer = null;
      }, 400);
    }
  }

  /** Clears the highlighted palette row. */
  resetPaletteSelect() {
    this.selectedLine.set(-1);
  }

  /**
   * Opens the palette's text for editing, or writes the edited text back to the palette when
   * editing ends.
   *
   * Editing also ends when the panel switches character or closes, so an edit is never lost.
   */
  toggleEditMode() {
    this.isEdit.set(!this.isEdit());
    if (this.isEdit()) {
      if (!this.palette) return;
      this.editPalette = this.palette.value + '';
    } else {
      if (!this.palette) return;
      this.palette.setPalette(this.editPalette);
    }
  }

  /** The translated name of an inventory tab. */
  getTabTitle(inventoryType: string) {
    return this.t(getTabTitleKey(inventoryType));
  }

  /**
   * The inventory behind a tab: the table, this user's personal inventory, the graveyard, or the
   * shared one.
   */
  getInventory(inventoryType: string) {
    return getInventory(inventoryType, this.inventoryService);
  }

  /**
   * The pieces listed under an inventory tab that this user may view, re-read as the inventory,
   * files, characters or this user's cursor change.
   */
  getGameObjects(inventoryType: string): TabletopObject[] {
    this.inventoryService.inventoryVersion();
    this.objectChange.fileVersion();
    this.objectChange.collectionOf('character')();
    this.objectChange.trackMyCursor();
    return getGameObjects(inventoryType, this.inventoryService).filter((object) => this.canView(object));
  }

  /**
   * Whether this user may see a piece in the target list; only characters can be hidden from them.
   */
  canView(object: TabletopObject): boolean {
    return object instanceof GameCharacter ? this.disclosureService.canView(object) : true;
  }

  /**
   * What the pieces being operated on carry between them.
   *
   * The buttons follow those pieces rather than the one the panel belongs to: an item is
   * operated on by name, so one the reader's own piece happens not to have is still theirs to
   * move on somebody else's, and one added to a sheet mid-session is there as soon as it is.
   * With nothing picked out yet, the whole tab stands in, so the buttons are there before the
   * first target is.
   */
  readonly counterChoices = computed<ResourceCatalogEntry[]>(() => {
    const characters = this.resourceTargets();
    for (const character of characters) this.objectChange.versionOf(character.identifier)();
    this.objectChange.versionOf(DataSummarySetting.instance.identifier)();
    this.objectChange.collectionOf('data')();
    const pick = this.controllerResources();
    return resourceCatalogOf(characters, { listFirst: this.dataTags }).filter((choice) =>
      controllerShowsResource(pick, choice.name)
    );
  });

  /**
   * The items the room lets its remotes show, or null for every one, as picked in the room
   * settings.
   */
  readonly controllerResources = computed<ControllerResourcePick>(() => {
    this.objectChange.versionOf('Config')();
    return (this.objectStore.get<Config>('Config') ?? Config.instance).controllerResources;
  });

  private resourceTargets(): GameCharacter[] {
    const targeted = this.getTargetCharacters(true);
    return targeted.length > 0 ? targeted : this.getTargetCharacters(false);
  }

  /** The item the buttons point at, as it stands among what the pieces carry. */
  readonly chosenChoice = computed<ResourceCatalogEntry | null>(() => {
    const name = this.remoteControllerSelect().name;
    if (name === '') return null;
    return this.counterChoices().find((choice) => choice.name === name) ?? null;
  });

  /**
   * The parts of the chosen item that can be moved.
   *
   * A resource answers to every one of them; anything else has its value alone, and is left
   * without a row of slots to read past.
   */
  readonly chosenSlots = computed<readonly ResourceSlot[]>(() =>
    this.chosenChoice()?.isResource ? RESOURCE_SLOTS : []
  );

  /** Lets go of a chosen item the pieces no longer carry, so the buttons and the act agree. */
  dropChosenIfGone(): void {
    const chosen = this.remoteControllerSelect();
    if (chosen.name === '') return;
    if (!this.counterChoices().some((choice) => choice.name === chosen.name)) this.remoteSelect('', 'now', '');
  }

  /**
   * The data elements the target list shows for a character, re-read when the character changes.
   *
   * They are the inventory's display items, less any value or resource the room has not picked for
   * its remotes. A check box, or a line break between the items, stays where it is.
   */
  getInventoryTags(gameObject: GameCharacter): (DataElement | null)[] {
    this.objectChange.versionOf(gameObject.identifier)();
    const pick = this.controllerResources();
    return getInventoryTags(gameObject, this.inventoryService).filter(
      (element) =>
        element === null ||
        element.name === this.newLineString ||
        !isChangeableElementType(element.type) ||
        controllerShowsResource(pick, element.name)
    );
  }

  /** Everything this panel says is already worked out, so none of it is evaluated again. */
  private announce(text: string, options: { portraitIndex: number; color?: string }): void {
    this.characterMacro.announce(this.character(), text, {
      tab: this.chatTab(),
      gameSystem: this._gameSystem,
      sendFrom: this.sendFrom,
      portraitIndex: options.portraitIndex,
      color: options.color ?? '#000000',
      bubbles: null,
    });
  }

  /**
   * The characters in the selected tab that the panel's operations apply to: only the ticked ones
   * with `checkedOnly`, otherwise all of them.
   */
  getTargetCharacters(checkedOnly: boolean): GameCharacter[] {
    this.uiSignalService.targetChange();
    const objectList = this.getGameObjects(this.selectTab());
    return getTargetCharacters(objectList, checkedOnly);
  }

  /**
   * Steps every buff on the characters in the selected tab down a round and announces which
   * characters it touched.
   *
   * With `checkedOnly` only ticked characters are affected. Nothing happens without a chat tab or
   * without any character to act on.
   */
  remoteDecBuffRound(checkedOnly: boolean) {
    if (!this.chatTab()) return;
    const targets = decreaseBuffRound(this.getTargetCharacters(checkedOnly));
    if (!targets) return;
    this.announce(this.t('feature.controller.remote.decBuffRoundMessage', { targets }), {
      portraitIndex: this.controllerInputComponent().portraitIndex(),
    });
  }

  /**
   * Steps the buffs on the ticked characters down a round, from the button for selected targets.
   */
  decBuffRoundSelect() {
    this.remoteDecBuffRound(true);
  }

  /**
   * Steps the buffs on every character in the selected tab down a round, from the button for all.
   */
  decBuffRoundAll() {
    this.remoteDecBuffRound(false);
  }

  /**
   * Clears the buffs that have run out on the characters in the selected tab and announces which
   * characters it touched.
   *
   * With `checkedOnly` only ticked characters are affected. Nothing happens without a chat tab or
   * without any character to act on.
   */
  remoteBuffDeleteZeroRound(checkedOnly: boolean) {
    if (!this.chatTab()) return;
    const targets = deleteZeroRoundBuffs(this.getTargetCharacters(checkedOnly));
    if (!targets) return;
    this.announce(this.t('feature.controller.remote.deleteZeroBuffMessage', { targets }), {
      portraitIndex: this.controllerInputComponent().portraitIndex(),
    });
  }

  /** Clears the run-out buffs on the ticked characters, from the button for selected targets. */
  deleteZeroRoundBuffSelect() {
    this.remoteBuffDeleteZeroRound(true);
  }

  /** Clears the run-out buffs on every character in the selected tab, from the button for all. */
  deleteZeroRoundBuffAll() {
    this.remoteBuffDeleteZeroRound(false);
  }

  /**
   * Adds the panel's amount to the chosen part of the chosen item on every ticked character, and
   * announces the result in the chat.
   *
   * The recovery limit options stop a value at its maximum or minimum. An error is shown instead
   * when no item is chosen or when no ticked character carries it.
   */
  remoteChangeValue() {
    const gameCharacters = this.getTargetCharacters(true);
    const chosen = this.remoteControllerSelect();
    if (chosen.name == '') {
      this.errorMessageController = this.t('feature.controller.remote.noChangeTarget');
      return;
    }
    const parts: string[] = [];
    const name = chosen.name;
    const nowOrMax = chosen.nowOrMax;
    const addValue = this.remoteNumber;
    for (const object of gameCharacters) {
      parts.push(
        object.status.changeValue(name, nowOrMax, addValue, this.recoveryLimitFlagMin, this.recoveryLimitFlag)
      );
    }
    const text = parts.join('');
    if (text != '') {
      const sign = this.remoteNumber < 0 ? '' : '+';
      const mess = this.t('feature.controller.remote.changeValueMessage', {
        name: chosen.dispName,
        sign,
        value: this.remoteNumber,
        detail: text,
      });
      this.announce(mess, {
        portraitIndex: this.controllerInputComponent().portraitIndex(),
        color: this.controllerInputComponent().selectChatColor,
      });
      this.errorMessageController = '';
    } else {
      this.errorMessageController = this.t('feature.controller.remote.noTargetCharacter');
    }
  }

  /** Opens a character's buff panel at the pointer, from the buff edit button on its row. */
  buffEdit(gameCharacter: GameCharacter) {
    const coordinate = this.pointerDeviceService.pointers[0];
    const option: PanelOption = {
      left: coordinate.x,
      top: coordinate.y,
      width: 420,
      height: 300,
    };
    option.title = this.t('feature.controller.remote.buffEditWithName', { name: gameCharacter.name });
    this.panelService.openLazy(
      () =>
        import('@axe/features/character/game-character-buff-view/game-character-buff-view.component').then(
          (m) => m.GameCharacterBuffViewComponent
        ),
      option,
      (component) => component.character.set(gameCharacter)
    );
  }

  /**
   * Ticks or unticks every character in the selected tab as a target, from the select-all box.
   *
   * The tick stays in this browser: `targeted` is not synced, and the change is announced only to
   * this client's views.
   */
  allBoxCheck(value: { check: boolean }) {
    const objectList = this.getGameObjects(this.selectTab());
    for (const object of objectList) {
      if (object instanceof GameCharacter) {
        object.targeted = value.check;
        this.uiSignalService.notifyTargetChange(object.identifier, object.aliasName);
      }
    }
  }

  /**
   * Ticks or unticks a character as a target, from a click on its row. The tick stays in this
   * browser and is not shared with the room.
   */
  targetBlockClick(object: GameCharacter) {
    object.targeted = !object.targeted;
    this.uiSignalService.notifyTargetChange(object.identifier, object.aliasName);
  }

  /** Highlights a palette row and treats it as a click on its line, so a second click sends it. */
  onClickPaletteRow(row: PaletteRow): void {
    this.selectedLine.set(row.lineIndex);
    this.clickPalette(row.text);
  }
}
