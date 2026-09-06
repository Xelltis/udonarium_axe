import { DestroyRef, inject, Injectable } from '@angular/core';
import { CharacterMacroService } from '@axe/application/chat/character-macro.service';
import { CharacterDiceService } from '@axe/application/dice/character-dice.service';
import { EffectCastService } from '@axe/application/effect/effect-cast.service';
import { EffectFieldService } from '@axe/application/effect/effect-field.service';
import { EffectLibraryService } from '@axe/application/effect/effect-library.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { CutInService } from '@axe/application/media/cut-in.service';
import { RangeShapeInvokeService } from '@axe/application/tabletop/range-shape-invoke.service';
import { TabletopActionService } from '@axe/application/tabletop/tabletop-action.service';
import { TurnOrderService } from '@axe/application/turn/turn-order.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { Logger } from '@axe/core/logging/logger';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { decodeRangeShapeField } from '@axe/domain/data/range-shape-field';
import { EffectField } from '@axe/domain/effect/effect-field';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { Hotbar } from '@axe/domain/hotbar/hotbar';
import { HotbarStep, KEEP_INDEX, KEEP_SIZE, RangeSlotOptions } from '@axe/domain/hotbar/hotbar-payload';
import { findByReference } from '@axe/domain/hotbar/hotbar-reference';
import { HotbarCell } from '@axe/domain/hotbar/hotbar-size';
import { HotbarSlot } from '@axe/domain/hotbar/hotbar-slot';
import { hotbarSlotNeedsCharacter } from '@axe/domain/hotbar/hotbar-slot-kind';
import { hotbarSlotTag } from '@axe/domain/hotbar/hotbar-tag';
import { CutIn } from '@axe/domain/media/cut-in';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { RangeArea } from '@axe/domain/tabletop/range';
import { DEFAULT_CHARACTER_PANEL } from '@axe/domain/ui/room-panel';
import { findSlotActor } from '@axe/features/hotbar/hotbar-actor';
import { ObjectPanelService } from '@axe/features/panels/object-panel.service';

/** Why a slot would not run. The bar says these to the reader, so each one has a word of its own. */
export const HOTBAR_FAILURES = ['noCharacter', 'notFound', 'noTab', 'offTable', 'empty'] as const;

export type HotbarFailure = (typeof HOTBAR_FAILURES)[number];

export type HotbarRunResult = { ok: true } | { ok: false; reason: HotbarFailure };

const OK: HotbarRunResult = { ok: true };

function failed(reason: HotbarFailure): HotbarRunResult {
  return { ok: false, reason };
}

@Injectable({ providedIn: 'root' })
export class HotbarRunnerService {
  private readonly objectStore = inject(ObjectStore);
  private readonly audioStorage = inject(AudioStorage);
  private readonly macro = inject(CharacterMacroService);
  private readonly effectLibrary = inject(EffectLibraryService);
  private readonly effectCast = inject(EffectCastService);
  private readonly effectField = inject(EffectFieldService);
  private readonly rangeShapeInvoke = inject(RangeShapeInvokeService);
  private readonly tabletopAction = inject(TabletopActionService);
  private readonly characterDice = inject(CharacterDiceService);
  private readonly objectPanels = inject(ObjectPanelService);
  private readonly panelService = inject(PanelService);
  private readonly selectionSignal = inject(SelectionSignalService);
  private readonly uiSignal = inject(UiSignalService);
  private readonly cutInService = inject(CutInService);
  private readonly turnOrder = inject(TurnOrderService);
  private readonly t = inject(TRANSLATE_FN);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    this.destroyRef.onDestroy(() => {
      for (const timer of this.pending) clearTimeout(timer);
      this.pending.clear();
    });
  }

  run(slot: HotbarSlot, character: GameCharacter | null, cell: HotbarCell): HotbarRunResult {
    const kind = slot.slotKind;
    if (hotbarSlotNeedsCharacter(kind) && !character) return failed('noCharacter');

    switch (kind) {
      case 'chat':
        return this.runChat(slot, character!);
      case 'effect':
        return this.runEffect(slot, character!, cell);
      case 'range':
        return this.runRange(slot, character!, cell);
      case 'diceDeploy':
        return this.runDice(character!);
      case 'panel':
        return this.runPanel(slot, character!);
      case 'focus':
        return this.runFocus(character!);
      case 'sound':
        return this.runSound(slot);
      case 'cutIn':
        return this.runCutIn(slot);
      case 'prefill':
        return this.runPrefill(slot);
      case 'turn':
        return this.runTurn(slot);
      case 'appearance':
        return this.runAppearance(slot, character!);
      case 'group':
        return this.runGroup(slot, character);
    }
  }

  private runChat(slot: HotbarSlot, character: GameCharacter): HotbarRunResult {
    const line = slot.argument;
    if (!line.trim()) return failed('empty');

    const options = slot.options;
    const tab = this.macro.currentTab(options.kind === 'chat' ? options.tab : '');
    if (!tab) return failed('noTab');

    this.macro
      .sendAsCharacter(character, line.replace(/\\n/g, '\n'), {
        tab,
        gameType: options.kind === 'chat' && options.gameType ? options.gameType : undefined,
        colorIndex: options.kind === 'chat' ? options.colorIndex : 0,
      })
      .catch((reason: unknown) => Logger.warn('[Hotbar] スロットの発言を送れませんでした', reason));
    return OK;
  }

  private runEffect(slot: HotbarSlot, character: GameCharacter, cell: HotbarCell): HotbarRunResult {
    const preset = this.effectLibrary.findByName(slot.argument);
    if (!preset) return failed('notFound');

    const options = slot.options;
    const mode = options.kind === 'effect' ? options.mode : 'cast';
    if (mode === 'preview') return this.effectCast.preview(preset) ? OK : failed('notFound');
    if (mode === 'field') return this.layField(preset, character, cell);
    // Told to pay no heed to what is targeted, the effect plays on the piece that pressed it,
    // so a guard put up in the middle of a fight does not fly at whoever happens to be marked.
    if (options.kind === 'effect' && options.onSelf) {
      return this.effectCast.fire(preset, [character], null) ? OK : failed('notFound');
    }
    return this.effectCast.fireFromCharacter(preset, character) ? OK : failed('notFound');
  }

  /**
   * Puts the effect on the ground, or takes away the one this slot put there for this piece.
   *
   * The same press does both, as it does for a range: what a slot lays out is the slot's to
   * take away again, and there is nowhere else to reach a field from once it is down.
   */
  private layField(preset: EffectPreset, character: GameCharacter, cell: HotbarCell): HotbarRunResult {
    const tag = hotbarSlotTag(Hotbar.ownerId, cell, character.identifier);
    if (this.takeAwayField(tag)) return OK;

    const field = this.effectField.place(preset, character.location.x, character.location.y, character.posZ);
    field.laidByHotbarSlot = tag;
    field.update();
    return OK;
  }

  private takeAwayField(tag: string): boolean {
    const laid = this.objectStore
      .getObjects<EffectField>(EffectField)
      .filter((field) => field.laidByHotbarSlot === tag);
    if (laid.length < 1) return false;

    for (const field of laid) this.effectField.remove(field);
    SoundEffect.play(PresetSound.sweep);
    return true;
  }

  /** Lays the range out, or takes down the one this slot laid for this character. */
  private runRange(slot: HotbarSlot, character: GameCharacter, cell: HotbarCell): HotbarRunResult {
    const tag = hotbarSlotTag(Hotbar.ownerId, cell, character.identifier);
    if (this.takeDownRange(tag)) return OK;

    const options = slot.options;
    const docks = options.kind !== 'range' || options.dock;

    const custom = decodeRangeShapeField(slot.argument);
    const range = custom
      ? this.rangeShapeInvoke.spawnForCharacter(character, custom)
      : this.namedRange(slot.argument.trim(), character);
    if (!range) return failed('empty');

    if (options.kind === 'range') this.dressRange(range, options);
    if (docks) {
      range.followingCharacterIdentifier = character.identifier;
      range.following();
    }
    range.laidByHotbarSlot = tag;
    range.update();
    return OK;
  }

  /** The range wears what the slot describes: a name and a size, its colours, and how it paints. */
  private dressRange(range: RangeArea, options: RangeSlotOptions): void {
    const name = options.name.trim();
    if (name) range.name = name;
    if (options.length > 0) range.length = options.length;
    if (options.width > 0) range.width = options.width;

    if (options.borderColor) range.rangeColor = options.borderColor;
    if (options.fillColor) range.gridColor = options.fillColor;
    range.setOpacityPercent(options.opacity);
    range.fillOutLine = options.fillOutline;
    range.subDivisionSnapPolygonal = options.rotateSnap;
    range.offSetX = options.shiftX;
    range.offSetY = options.shiftY;
  }

  private namedRange(typeName: string, character: GameCharacter): RangeArea | null {
    if (!typeName) return null;
    return this.tabletopAction.createRangeArea(
      { x: character.location.x, y: character.location.y, z: character.posZ },
      typeName
    );
  }

  /**
   * Takes down the ranges this slot laid, and says whether there were any.
   *
   * The mark is on the ranges themselves, so a slot finds its own again after a reload, in
   * another window of the same reader, and however many it managed to leave lying about.
   */
  /** Takes down whatever a trial in the editor laid on the table, its cell belonging to no slot. */
  takeDownRehearsal(cell: HotbarCell, character: GameCharacter | null): boolean {
    if (!character) return false;

    const tag = hotbarSlotTag(Hotbar.ownerId, cell, character.identifier);
    const range = this.takeDownRange(tag);
    return this.takeAwayField(tag) || range;
  }

  private takeDownRange(tag: string): boolean {
    const laid = this.objectStore.getObjects<RangeArea>(RangeArea).filter((range) => range.laidByHotbarSlot === tag);
    if (laid.length < 1) return false;

    for (const range of laid) range.destroy();
    SoundEffect.play(PresetSound.sweep);
    return true;
  }

  /** Lays the dice out, or takes back the ones already on the table. */
  private runDice(character: GameCharacter): HotbarRunResult {
    if (this.characterDice.putAway(character) > 0) return OK;
    return this.characterDice.deploy(character).length > 0 ? OK : failed('empty');
  }

  /** A slot that opens a panel closes it again, so the one key does both. */
  private runPanel(slot: HotbarSlot, character: GameCharacter): HotbarRunResult {
    const options = slot.options;
    const panel = options.kind === 'panel' ? options.panel : DEFAULT_CHARACTER_PANEL;
    const single = `hotbar-${panel}-${character.identifier}`;
    if (this.panelService.closeSingle(single)) return OK;

    if (panel === 'sheet') this.objectPanels.openCharacterSheet(character, { single });
    else if (panel === 'remoteController') this.objectPanels.openRemoteController(character, { single });
    else this.objectPanels.openChatPalette(character, { single });
    return OK;
  }

  private runFocus(character: GameCharacter): HotbarRunResult {
    if (character.location.name !== 'table') return failed('offTable');

    this.selectionSignal.focusToCoordinate(character.location.x, character.location.y);
    return OK;
  }

  private runSound(slot: HotbarSlot): HotbarRunResult {
    const identifier = slot.argument.trim();
    if (!identifier) return failed('empty');
    if (!this.audioStorage.get(identifier)) return failed('notFound');

    const options = slot.options;
    if (options.kind === 'sound' && options.local) SoundEffect.playLocal(identifier);
    else SoundEffect.play(identifier);
    return OK;
  }

  private runCutIn(slot: HotbarSlot): HotbarRunResult {
    const found = findByReference(this.objectStore.getObjects<CutIn>(CutIn), slot.argument, slot.valueName);
    if (!found) return failed('notFound');

    const cutIn = found.thing;

    const options = slot.options;
    const played =
      options.kind === 'cutIn' && options.soundOnly
        ? this.cutInService.launchSoundOnly(cutIn)
        : this.cutInService.launch(cutIn);
    return played ? OK : failed('notFound');
  }

  private runPrefill(slot: HotbarSlot): HotbarRunResult {
    const text = slot.argument;
    if (!text.trim()) return failed('empty');

    this.uiSignal.requestChatInputText(text.replace(/\\n/g, '\n'));
    return OK;
  }

  /**
   * Runs the slots this one names, in the order they were chosen.
   *
   * A step names the slot itself, so the group follows it when the reader moves it, and the
   * cell it sat in finds it again in a bar read from a file. A step acts as the piece it
   * names for itself, and as whoever the group is running as where it names none. A step
   * that is itself a group is passed over: one slot standing for several is worth having,
   * and a chain of them is a way to hang the room.
   *
   * What runs at once is answered for; what waits for its turn is taken as fired, since the
   * answer would arrive long after the reader has looked away.
   */
  /** What a group has left to do. A step never runs after the room it was pressed in is gone. */
  private readonly pending = new Set<ReturnType<typeof setTimeout>>();

  private runGroup(slot: HotbarSlot, character: GameCharacter | null): HotbarRunResult {
    const options = slot.options;
    if (options.kind !== 'group' || options.steps.length < 1) return failed('empty');

    const hotbar = Hotbar.mine();
    if (!hotbar) return failed('empty');

    const steps = options.steps
      .map((step) => ({ step, slot: this.stepSlot(hotbar, step) }))
      .filter((held): held is { step: HotbarStep; slot: HotbarSlot } => held.slot !== null);
    if (steps.length < 1) return failed('empty');

    let ran = 0;
    let waiting = 0;
    let firstFailure: HotbarFailure | null = null;

    // Each step waits for itself, one after another, so the run keeps the shape it was given.
    let waitedFor = 0;
    steps.forEach(({ step }, order) => {
      waitedFor += order > 0 ? Math.max(0, step.delayMs) : 0;
      if (waitedFor > 0) {
        waiting += 1;
        // The slot is looked for again when its turn comes: the bar may have changed by then,
        // and so may the piece - one that has left the table takes the rest of the run with it.
        const timer = setTimeout(() => {
          this.pending.delete(timer);
          if (character && !this.objectStore.get(character.identifier)) return;
          this.fireStep(hotbar, step, character);
        }, waitedFor);
        this.pending.add(timer);
        return;
      }

      const result = this.fireStep(hotbar, step, character);
      if (result?.ok) ran += 1;
      else if (result) firstFailure ??= result.reason;
    });

    if (ran > 0 || waiting > 0) return OK;
    return failed(firstFailure ?? 'empty');
  }

  /**
   * Runs one step of a group, at the cell its slot sits in now.
   *
   * A slot moved since the group was written is run where it is, so what it lays on the
   * table is marked for the slot's own cell and the slot can take it down again. A step
   * whose slot has gone in the meantime is passed over rather than run on a stray object.
   */
  private fireStep(hotbar: Hotbar, step: HotbarStep, character: GameCharacter | null): HotbarRunResult | null {
    const slot = this.stepSlot(hotbar, step);
    if (!slot) return null;

    return this.run(slot, this.actorFor(slot) ?? character, { page: slot.pageNo, slotIndex: slot.slotNo });
  }

  /** The slot a step names, by the slot itself and then by where it sat. */
  private stepSlot(hotbar: Hotbar, step: HotbarStep): HotbarSlot | null {
    const named = step.slotIdentifier
      ? (hotbar.slots.find((slot) => slot.identifier === step.slotIdentifier) ?? null)
      : null;
    const held = named ?? hotbar.slotAt(step.page, step.slotIndex);
    return held && held.slotKind !== 'group' ? held : null;
  }

  /** The piece a step names for itself, where it names one the reader may work. */
  private actorFor(slot: HotbarSlot): GameCharacter | null {
    if (!slot.characterIdentifier.trim() && !slot.characterName.trim()) return null;

    return (
      findSlotActor(slot, this.objectStore.getObjects<GameCharacter>(GameCharacter), PeerCursor.myCursor?.userId ?? '')
        ?.character ?? null
    );
  }

  /**
   * A piece changing what it looks like: its picture, the portrait it speaks with, its size.
   *
   * Each part is left alone unless the slot names one, so a slot that only grows the piece
   * leaves the picture as the reader last set it. Put in a multi-action beside an effect, this
   * is a transformation.
   */
  private runAppearance(slot: HotbarSlot, character: GameCharacter): HotbarRunResult {
    const options = slot.options;
    if (options.kind !== 'appearance') return failed('empty');

    const pictures = character.imageDataElement?.children.length ?? 0;
    const wantsPicture = options.image > KEEP_INDEX && pictures > 0;
    const wantsPortrait = options.portrait > KEEP_INDEX && pictures > 0;
    const wantsSize = options.size > KEEP_SIZE;
    if (!wantsPicture && !wantsPortrait && !wantsSize) return failed('empty');

    if (wantsPicture) {
      character.addExtendData();
      const icon = character.detailDataElement?.getFirstElementByName('ICON');
      if (!icon) return failed('notFound');
      icon.currentValue = Math.min(options.image, pictures - 1);
      icon.value = pictures - 1;
    }
    // The portrait a reader speaks with is theirs alone, so this one reaches no further.
    if (wantsPortrait) character.selectedPortraitIndex = options.portrait;
    if (wantsSize) character.size = options.size;

    character.update();
    return OK;
  }

  private runTurn(slot: HotbarSlot): HotbarRunResult {
    const options = slot.options;
    const action = options.kind === 'turn' ? options.action : 'next';
    if (action === 'prev') this.turnOrder.prev();
    else if (action === 'reset') this.turnOrder.reset();
    else this.turnOrder.next();
    return OK;
  }
}
