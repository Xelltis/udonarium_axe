import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChatSpeakerService } from '@axe/application/chat/chat-speaker.service';
import { EffectLibraryService } from '@axe/application/effect/effect-library.service';
import { HotbarStoreService } from '@axe/application/hotbar/hotbar-store.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopActionService } from '@axe/application/tabletop/tabletop-action.service';
import { getRangeMenuItems } from '@axe/application/tabletop/tabletop-action-helpers';
import { PanelService } from '@axe/application/ui/panel.service';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { BUFF_COLORS } from '@axe/domain/character/buff-appearance';
import { GameCharacter } from '@axe/domain/character/game-character';
import { PaletteCommandGroup, paletteCommandGroups } from '@axe/domain/chat/palette-rows';
import { Hotbar } from '@axe/domain/hotbar/hotbar';
import { hotbarSlotLabel } from '@axe/domain/hotbar/hotbar-appearance';
import { emptyHotbarSlotDraft, HotbarSlotDraft } from '@axe/domain/hotbar/hotbar-draft';
import {
  EFFECT_MODES,
  encodeHotbarPayload,
  HotbarPayload,
  HotbarStep,
  KEEP_INDEX,
  KEEP_SIZE,
  MAX_STEP_DELAY_MS,
  parseHotbarPayload,
  sameHotbarStep,
  TURN_ACTIONS,
} from '@axe/domain/hotbar/hotbar-payload';
import { HotbarCell } from '@axe/domain/hotbar/hotbar-size';
import { HotbarSlot } from '@axe/domain/hotbar/hotbar-slot';
import {
  HOTBAR_SLOT_KINDS,
  HotbarSlotKind,
  hotbarSlotNeedsCharacter,
  toHotbarSlotKind,
} from '@axe/domain/hotbar/hotbar-slot-kind';
import { CutIn } from '@axe/domain/media/cut-in';
import { presetSoundLabelKey, soundFileName } from '@axe/domain/media/preset-sound-labels';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { RANGE_DEFAULT_BORDER_COLOR, RANGE_DEFAULT_FILL_COLOR } from '@axe/domain/tabletop/range';
import { CHARACTER_PANELS, DEFAULT_CHARACTER_PANEL, panelLabelKey } from '@axe/domain/ui/room-panel';
import { findSlotActor } from '@axe/features/hotbar/hotbar-actor';
import { HotbarRunnerService } from '@axe/features/hotbar/hotbar-runner.service';
import { selectControllableCharacters } from '@axe/features/pl-tools/owned-character-list/owned-characters';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * A trial belongs to no cell of the bar, so what it lays out is its own to take down again.
 *
 * Nothing saved can ever sit at this cell, so a range laid by a trial is never mistaken for
 * one a slot laid - and never left behind either: the editor takes its own down when it goes.
 */
const REHEARSAL_CELL: HotbarCell = { page: -1, slotIndex: -1 };

/** What a step joining a group waits for, until the reader says otherwise. */
const DEFAULT_STEP_DELAY_MS = 300;

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'hotbar-slot-editor',
  templateUrl: './hotbar-slot-editor.component.html',
  imports: [FormsModule, TranslocoModule],
})
export class HotbarSlotEditorComponent {
  private readonly panelService = inject(PanelService);
  private readonly runner = inject(HotbarRunnerService);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    // Saved, emptied or simply closed, the editor leaves nothing of its trials behind.
    this.destroyRef.onDestroy(() => this.clearRehearsal());
  }
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly audioStorage = inject(AudioStorage);
  private readonly effectLibrary = inject(EffectLibraryService);
  private readonly tabletopAction = inject(TabletopActionService);
  private readonly hotbarStore = inject(HotbarStoreService);
  private readonly chatSpeaker = inject(ChatSpeakerService);
  private readonly t = inject(TRANSLATE_FN);

  readonly cell = signal<HotbarCell>({ page: 0, slotIndex: 0 });
  readonly draft = signal<HotbarSlotDraft>(emptyHotbarSlotDraft());

  readonly kinds = HOTBAR_SLOT_KINDS;
  protected readonly effectModes = EFFECT_MODES;
  protected readonly panelNames = CHARACTER_PANELS;
  protected readonly turnActions = TURN_ACTIONS;

  protected readonly colors = BUFF_COLORS;
  protected readonly icons = [
    'chat_bubble',
    'casino',
    'auto_awesome',
    'radar',
    'add_circle',
    'favorite',
    'bolt',
    'shield',
    'local_fire_department',
    'healing',
    'volume_up',
    'slideshow',
    'person',
    'article',
    'my_location',
    'skip_next',
    'star',
    'flag',
  ];

  /** What a slot of this kind can point at, so nothing has to be typed from memory. */
  protected readonly choices = computed<{ value: string; name: string }[]>(() => {
    switch (this.kind()) {
      case 'effect':
        return this.effectLibrary.presets().map((preset) => ({ value: preset.name, name: preset.name }));
      case 'sound':
        this.objectChange.fileVersion();
        return [...this.audioStorage.audios]
          .map((audio) => {
            const labelKey = presetSoundLabelKey(audio.identifier);
            return { value: audio.identifier, name: labelKey ? this.t(labelKey) : soundFileName(audio.name) };
          })
          .sort((left, right) => left.name.localeCompare(right.name, 'ja'));
      case 'cutIn':
        this.objectChange.collectionOf('cut-in')();
        return this.objectStore
          .getObjects<CutIn>(CutIn)
          .map((cutIn) => ({ value: cutIn.identifier, name: cutIn.name }));
      case 'range':
        return getRangeMenuItems().map((item) => ({ value: item.typeName, name: this.t(item.menuName) }));
      default:
        return [];
    }
  });

  protected readonly picksFromList = computed(() => this.choices().length > 0);

  /** Who the slot speaks as while it is being written, so its palette is the one on offer. */
  private readonly actingCharacter = computed<GameCharacter | null>(() => {
    this.objectChange.collectionOf(GameCharacter.aliasName)();
    const draft = this.draft();
    if (!draft.characterIdentifier.trim() && !draft.characterName.trim()) return this.chatSpeaker.current();

    const found = findSlotActor(
      draft,
      this.objectStore.getObjects<GameCharacter>(GameCharacter),
      PeerCursor.myCursor?.userId ?? ''
    );
    return found?.character ?? null;
  });

  /** The lines already written in that character's palette, for a slot that says something. */
  protected readonly palettePicks = computed<PaletteCommandGroup[]>(() => {
    const kind = this.kind();
    if (kind !== 'chat' && kind !== 'prefill') return [];

    const palette = this.actingCharacter()?.chatPalette ?? null;
    if (!palette) return [];
    this.objectChange.versionOf(palette.identifier)();
    return paletteCommandGroups(palette.getPalette());
  });

  /** Only a slot that acts on a character has to say which one. */
  protected readonly needsActor = computed(() => hotbarSlotNeedsCharacter(this.kind()));

  protected readonly kind = computed<HotbarSlotKind>(() => this.draft().kind);
  protected readonly options = computed<HotbarPayload>(() => this.draft().payload);

  protected readonly effectMode = computed(() => {
    const options = this.options();
    return options.kind === 'effect' ? options.mode : 'cast';
  });
  protected readonly panelName = computed(() => {
    const options = this.options();
    return options.kind === 'panel' ? options.panel : DEFAULT_CHARACTER_PANEL;
  });
  protected readonly turnAction = computed(() => {
    const options = this.options();
    return options.kind === 'turn' ? options.action : 'next';
  });
  protected readonly playsLocally = computed(() => {
    const options = this.options();
    return options.kind === 'sound' && options.local;
  });
  protected readonly playsSoundOnly = computed(() => {
    const options = this.options();
    return options.kind === 'cutIn' && options.soundOnly;
  });
  /** Every filled slot of the reader's own bar, for a group to pick its steps from. */
  /** Told to pay no heed to what is targeted, the effect plays on the piece that pressed it. */
  protected readonly effectOnSelf = computed(() => {
    const options = this.options();
    return options.kind === 'effect' && options.onSelf;
  });

  protected readonly stepChoices = computed<{ step: HotbarStep; label: string; key: string; chosen: boolean }[]>(() => {
    if (this.kind() !== 'group') return [];

    this.objectChange.collectionOf(Hotbar.aliasName)();
    const hotbar = this.hotbarStore.own();
    if (!hotbar) return [];
    this.objectChange.versionOf(hotbar.identifier)();

    const taken = this.groupSteps();
    const here = this.cell();
    return hotbar.slots
      .filter((slot) => slot.slotKind !== 'group')
      .filter((slot) => slot.pageNo !== here.page || slot.slotNo !== here.slotIndex)
      .sort((left, right) => left.pageNo - right.pageNo || left.slotNo - right.slotNo)
      .map((slot) => ({
        step: { page: slot.pageNo, slotIndex: slot.slotNo, slotIdentifier: slot.identifier, delayMs: 0 },
        label: hotbarSlotLabel(slot.argument, slot.label),
        key: `${slot.pageNo + 1}-${(slot.slotNo + 1) % 10}`,
        chosen: taken.some((step) =>
          sameHotbarStep(step, { page: slot.pageNo, slotIndex: slot.slotNo, slotIdentifier: slot.identifier })
        ),
      }));
  });

  /**
   * The steps as they will run: in order, each with what it waits for.
   *
   * The order is the reader's to set - what was chosen first is rarely what should go first -
   * and the wait belongs to the step rather than to the group, so that a blow can land a
   * moment after the swing while the shout that follows waits a breath longer.
   */
  protected readonly stepRows = computed<{ step: HotbarStep; label: string; key: string; order: number }[]>(() => {
    const choices = this.stepChoices();
    return this.groupSteps().map((step, order) => {
      const found = choices.find((choice) => sameHotbarStep(step, choice.step));
      return {
        step,
        label: found?.label ?? this.t('feature.hotbar.editor.stepGone'),
        key: found?.key ?? `${step.page + 1}-${(step.slotIndex + 1) % 10}`,
        order,
      };
    });
  });

  protected moveStep(order: number, by: number): void {
    const steps = [...this.groupSteps()];
    const to = order + by;
    if (order < 0 || order >= steps.length || to < 0 || to >= steps.length) return;
    const [held] = steps.splice(order, 1);
    steps.splice(to, 0, held);
    this.patchOptions({ steps });
  }

  protected dropStep(order: number): void {
    const steps = this.groupSteps().filter((_, index) => index !== order);
    this.patchOptions({ steps });
  }

  /** The first step runs on the press itself, so what it would wait for is nothing. */
  protected setStepDelay(order: number, delayMs: number): void {
    const held = Number.isFinite(delayMs) ? Math.max(0, Math.min(MAX_STEP_DELAY_MS, Math.floor(delayMs))) : 0;
    const steps = this.groupSteps().map((step, index) => (index === order ? { ...step, delayMs: held } : step));
    this.patchOptions({ steps });
  }

  protected readonly maxStepDelay = MAX_STEP_DELAY_MS;

  /**
   * Writes down which slot each step means, as the bar has it now.
   *
   * A step found by its cell rather than by its identifier is holding an identifier from
   * another room or from before a file was read in, and saving is where it is put right.
   */
  private settleSteps(): void {
    const steps = this.groupSteps();
    if (steps.length < 1) return;

    const choices = this.stepChoices();
    const settled = steps.map((step) => {
      const found = choices.find((choice) => sameHotbarStep(step, choice.step));
      return found ? { ...step, ...found.step, delayMs: step.delayMs } : step;
    });
    this.patchOptions({ steps: settled });
  }

  protected readonly groupSteps = computed<HotbarStep[]>(() => {
    const options = this.options();
    return options.kind === 'group' ? options.steps : [];
  });

  /** A step joins the end of the list, and is moved from there to wherever it belongs. */
  protected toggleStep(step: HotbarStep, chosen: boolean): void {
    const steps = this.groupSteps().filter((held) => !sameHotbarStep(held, step));
    if (!chosen) return this.patchOptions({ steps });
    // A step joining a group that already has one waits a moment by default, rather than
    // arriving on top of what came before it.
    const delayMs = steps.length > 0 ? DEFAULT_STEP_DELAY_MS : 0;
    this.patchOptions({ steps: [...steps, { ...step, delayMs }] });
  }

  protected readonly docksToPiece = computed(() => {
    const options = this.options();
    return options.kind === 'range' ? options.dock : true;
  });
  protected readonly rangeName = computed(() => {
    const options = this.options();
    return options.kind === 'range' ? options.name : '';
  });
  protected readonly rangeLength = computed(() => {
    const options = this.options();
    return options.kind === 'range' && options.length > 0 ? options.length : null;
  });
  protected readonly rangeWidth = computed(() => {
    const options = this.options();
    return options.kind === 'range' && options.width > 0 ? options.width : null;
  });
  protected readonly rangeBorderColor = computed(() => {
    const options = this.options();
    return (options.kind === 'range' && options.borderColor) || RANGE_DEFAULT_BORDER_COLOR;
  });
  protected readonly rangeFillColor = computed(() => {
    const options = this.options();
    return (options.kind === 'range' && options.fillColor) || RANGE_DEFAULT_FILL_COLOR;
  });
  protected readonly rangeOpacity = computed(() => {
    const options = this.options();
    return options.kind === 'range' ? options.opacity : 100;
  });
  protected readonly rangeFillsOutline = computed(() => {
    const options = this.options();
    return options.kind === 'range' && options.fillOutline;
  });
  protected readonly rangeSnapsOnRotate = computed(() => {
    const options = this.options();
    return options.kind !== 'range' || options.rotateSnap;
  });
  protected readonly rangeShiftsX = computed(() => {
    const options = this.options();
    return options.kind === 'range' && options.shiftX;
  });
  protected readonly rangeShiftsY = computed(() => {
    const options = this.options();
    return options.kind === 'range' && options.shiftY;
  });

  setFrom(cell: HotbarCell, draft: HotbarSlotDraft): void {
    this.cell.set(cell);
    this.draft.set({ ...draft, payload: { ...draft.payload } });
  }

  protected setActor(identifier: string): void {
    const named = this.actors().find((actor) => actor.value === identifier);
    this.draft.update((draft) => ({ ...draft, characterIdentifier: identifier, characterName: named?.name ?? '' }));
  }

  /** The pieces a slot may be told to act as, with an entry for leaving it to the moment. */
  protected readonly actors = computed<{ value: string; name: string }[]>(() => {
    this.objectChange.collectionOf(GameCharacter.aliasName)();
    return selectControllableCharacters(
      this.objectStore.getObjects<GameCharacter>(GameCharacter),
      PeerCursor.myCursor?.userId ?? ''
    ).map((character) => ({ value: character.identifier, name: character.name }));
  });

  protected readonly panelLabelKey = panelLabelKey;

  protected setKind(kind: string): void {
    const held = toHotbarSlotKind(kind);
    this.draft.update((draft) => ({ ...draft, kind: held, payload: parseHotbarPayload(held, null) }));
  }

  /** A line taken from the palette lands in the box, where it can still be worked on. */
  protected takeFromPalette(line: string): void {
    if (!line) return;
    this.setValue(line);
  }

  /** A value chosen from a list keeps the name it was shown under; a typed one has none. */
  protected setChoice(value: string): void {
    const chosen = this.choices().find((choice) => choice.value === value);
    this.draft.update((draft) => ({ ...draft, value, valueName: chosen?.name ?? '' }));
  }

  protected setValue(value: string): void {
    this.draft.update((draft) => ({ ...draft, value }));
  }

  protected setLabel(label: string): void {
    this.draft.update((draft) => ({ ...draft, label }));
  }

  protected setIcon(icon: string): void {
    this.draft.update((draft) => ({ ...draft, icon }));
  }

  protected setColor(color: string): void {
    this.draft.update((draft) => ({ ...draft, color }));
  }

  /**
   * The parts of a look, counted from one as the sheet counts them.
   *
   * An empty box is a part the slot leaves alone, which is what the "leave it" value stands for.
   */
  protected readonly appearanceImage = computed<number | null>(() => {
    const options = this.options();
    return options.kind === 'appearance' && options.image > KEEP_INDEX ? options.image + 1 : null;
  });

  protected readonly appearancePortrait = computed<number | null>(() => {
    const options = this.options();
    return options.kind === 'appearance' && options.portrait > KEEP_INDEX ? options.portrait + 1 : null;
  });

  protected readonly appearanceSize = computed<number | null>(() => {
    const options = this.options();
    return options.kind === 'appearance' && options.size > KEEP_SIZE ? options.size : null;
  });

  protected patchAppearanceIndex(field: 'image' | 'portrait', value: number): void {
    this.patchOptions({ [field]: Number.isFinite(value) && value >= 1 ? Math.floor(value) - 1 : KEEP_INDEX });
  }

  protected patchAppearanceSize(value: number): void {
    this.patchOptions({ size: Number.isFinite(value) && value > 0 ? Math.floor(value) : KEEP_SIZE });
  }

  /** An empty box means "as the shape comes", which is what a size of none stands for. */
  protected patchSize(field: 'length' | 'width', value: number): void {
    this.patchOptions({ [field]: Number.isFinite(value) && value > 0 ? Math.floor(value) : 0 });
  }

  protected patchOptions(patch: Record<string, unknown>): void {
    this.draft.update((draft) => ({ ...draft, payload: { ...draft.payload, ...patch } as HotbarPayload }));
  }

  protected save(): void {
    const hotbar = this.hotbarStore.ensureOwn();
    if (!hotbar) return;

    this.settleSteps();
    const cell = this.cell();
    hotbar.put(cell.page, cell.slotIndex, this.draft());
    this.panelService.close();
  }

  protected clear(): void {
    const cell = this.cell();
    this.hotbarStore.own()?.clear(cell.page, cell.slotIndex);
    this.panelService.close();
  }

  /** Runs a slot that belongs to nobody, so trying a draft cannot disturb what is saved. */
  protected tryIt(): void {
    const draft = this.draft();
    const character = this.actingCharacter();

    const rehearsal = new HotbarSlot();
    // The trial is never on a bar and never anybody else's business, so it is not put in the
    // store: doing so sent it to every peer and left a tombstone there when it was thrown away.
    rehearsal.kind = draft.kind;
    rehearsal.value = draft.value;
    rehearsal.label = draft.label;
    rehearsal.icon = draft.icon;
    rehearsal.color = draft.color;
    rehearsal.payload = encodeHotbarPayload(draft.payload);
    rehearsal.characterIdentifier = draft.characterIdentifier;
    rehearsal.characterName = draft.characterName;
    rehearsal.valueName = draft.valueName;
    this.runner.run(rehearsal, character, REHEARSAL_CELL);
    this.rehearsedAs.set(character);
  }

  /** Whoever the last trial acted as, so that what it laid out can be taken down again. */
  private readonly rehearsedAs = signal<GameCharacter | null>(null);

  private clearRehearsal(): void {
    const character = this.rehearsedAs();
    this.rehearsedAs.set(null);
    this.runner.takeDownRehearsal(REHEARSAL_CELL, character);
  }

  protected close(): void {
    this.panelService.close();
  }
}
