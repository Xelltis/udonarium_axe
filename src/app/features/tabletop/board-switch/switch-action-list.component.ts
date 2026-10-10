import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { EffectLibraryService } from '@axe/application/effect/effect-library.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ConcealmentService } from '@axe/application/tabletop/concealment.service';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { CutIn } from '@axe/domain/media/cut-in';
import { presetSoundLabelKey, soundFileName } from '@axe/domain/media/preset-sound-labels';
import { CONCEALED_LOCATION } from '@axe/domain/tabletop/board-switch/concealment';
import {
  clampSwitchDelay,
  clampSwitchSpawn,
  MAX_SWITCH_ACTIONS,
  newSwitchAction,
  SWITCH_ACTION_KINDS,
  SWITCH_SECRET_READERS,
  SWITCH_SPAWN_PLACES,
  SWITCH_TOGGLES,
  SwitchAction,
  SwitchActionKind,
  SwitchShowHide,
  SwitchSpawn,
} from '@axe/domain/tabletop/board-switch/switch-definition';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import { listedThingLabel } from '@axe/features/tabletop/board-switch/concealment-context-menu';
import { TranslocoModule } from '@jsverse/transloco';

interface NameChoice {
  value: string;
  name: string;
}

/**
 * The list of things a switch does, in the order it does them, for the master to write.
 *
 * Each thing is a line to say or a sound, effect or cut-in to play by name, with how long to wait
 * after the one before it. Something a newer version wrote and this one cannot do is shown as
 * such and kept where it stands, so writing the list back does not lose it.
 */
@Component({
  selector: 'app-switch-action-list',
  templateUrl: './switch-action-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoModule],
})
export class SwitchActionListComponent {
  private readonly effectLibrary = inject(EffectLibraryService);
  private readonly audioStorage = inject(AudioStorage);
  private readonly imageStorage = inject(ImageStorage);
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly t = inject(TRANSLATE_FN);
  private readonly concealment = inject(ConcealmentService);

  readonly actions = input.required<readonly SwitchAction[]>();
  readonly actionsChange = output<SwitchAction[]>();

  protected readonly kinds = SWITCH_ACTION_KINDS;
  protected readonly readers = SWITCH_SECRET_READERS;
  protected readonly full = computed(() => this.actions().length >= MAX_SWITCH_ACTIONS);

  private readonly effectChoices = computed<NameChoice[]>(() =>
    this.effectLibrary.presets().map((preset) => ({ value: preset.name, name: preset.name }))
  );

  private readonly soundChoices = computed<NameChoice[]>(() => {
    this.objectChange.fileVersion();
    return [...this.audioStorage.audios]
      .map((audio) => {
        const labelKey = presetSoundLabelKey(audio.identifier);
        return { value: audio.name, name: labelKey ? this.t(labelKey) : soundFileName(audio.name) };
      })
      .sort((left, right) => left.name.localeCompare(right.name, 'ja'));
  });

  private readonly cutInChoices = computed<NameChoice[]>(() => {
    this.objectChange.collectionOf('cut-in')();
    return this.objectStore.getObjects<CutIn>(CutIn).map((cutIn) => ({ value: cutIn.name, name: cutIn.name }));
  });

  /**
   * What a played thing can be, with the name already written kept on offer even where nothing in
   * the room goes by it, so opening the list does not quietly swap it for something else.
   */
  protected choicesFor(action: SwitchAction): NameChoice[] {
    if (action.kind !== 'sound' && action.kind !== 'effect' && action.kind !== 'cutIn') return [];
    const choices =
      action.kind === 'sound'
        ? this.soundChoices()
        : action.kind === 'effect'
          ? this.effectChoices()
          : this.cutInChoices();
    const name = action.name.trim();
    if (name.length < 1 || choices.some((choice) => choice.value === name)) return choices;
    return [{ value: name, name: this.t('feature.boardSwitch.missing', { name }) }, ...choices];
  }

  /**
   * What a reveal or a conceal can name: what the master has put out of sight, or what stands on
   * the table being looked at, each with the kind of thing it is. What it already names is kept on
   * offer even where it is gone, so opening the list does not quietly point it at something else.
   */
  protected targetsFor(action: SwitchShowHide | SwitchSpawn): NameChoice[] {
    const choices =
      action.kind === 'spawn'
        ? this.templateChoices()
        : action.kind === 'reveal'
          ? this.concealedChoices()
          : this.concealableChoices();
    const held = action.target;
    if (held.identifier.length < 1 || choices.some((choice) => choice.value === held.identifier)) return choices;
    return [{ value: held.identifier, name: this.t('feature.boardSwitch.missing', { name: held.name }) }, ...choices];
  }

  protected setTarget(index: number, identifier: string): void {
    const held = this.actions()[index];
    if (held?.kind !== 'reveal' && held?.kind !== 'conceal' && held?.kind !== 'spawn') return;
    const found = this.objectStore.get(identifier);
    const name = found instanceof TabletopObject ? found.name : held.target.name;
    this.replace(index, { ...held, target: { identifier, name: identifier.length > 0 ? name : '' } });
  }

  protected readonly spawnPlaces = SWITCH_SPAWN_PLACES;
  protected readonly toggles = SWITCH_TOGGLES;

  /** The tables of the room, which a switch can turn everybody's view to or carry a piece onto. */
  protected readonly tables = computed<NameChoice[]>(() => {
    this.objectChange.collectionOf(GameTable.aliasName)();
    return this.objectStore
      .getObjects<GameTable>(GameTable)
      .map((table) => ({ value: table.identifier, name: table.name.trim() || table.identifier }));
  });

  /** The pictures the room has, which a switch can lay on the table. */
  protected readonly images = computed<NameChoice[]>(() => {
    this.objectChange.fileVersion();
    return this.imageStorage.images
      .filter((image) => image.name.trim().length > 0)
      .map((image) => ({ value: image.identifier, name: image.name }));
  });

  /** The music the room has, which a switch can put on. */
  protected readonly tracks = computed<NameChoice[]>(() => {
    this.objectChange.fileVersion();
    return [...this.audioStorage.audios]
      .map((audio) => ({ value: audio.identifier, name: soundFileName(audio.name) }))
      .sort((left, right) => left.name.localeCompare(right.name, 'ja'));
  });

  /** Points a table, a picture or a track an action names at another, by what it is called too. */
  protected setRef(index: number, key: 'table' | 'image' | 'bgm', identifier: string, choices: NameChoice[]): void {
    const held = this.actions()[index];
    if (!held) return;
    const name = choices.find((choice) => choice.value === identifier)?.name ?? '';
    const ref = { identifier, name: identifier.length > 0 ? name : '' };
    if (key === 'table' && (held.kind === 'showTable' || held.kind === 'carry'))
      this.replace(index, { ...held, table: ref });
    if (key !== 'table' && held.kind === 'tableSetting') this.replace(index, { ...held, [key]: ref });
  }

  protected setCell(index: number, key: 'col' | 'row', value: string): void {
    const held = this.actions()[index];
    const cell = Math.max(0, Math.min(999, Math.round(Number(value) || 0)));
    if (held?.kind === 'carry') this.replace(index, { ...held, [key]: cell });
  }

  protected setToggle(index: number, key: 'darkness' | 'fog', value: string): void {
    const held = this.actions()[index];
    const toggle = value === 'on' || value === 'off' ? value : 'keep';
    if (held?.kind === 'tableSetting') this.replace(index, { ...held, [key]: toggle });
  }

  protected setBgmStop(index: number, stop: boolean): void {
    const held = this.actions()[index];
    if (held?.kind === 'tableSetting') this.replace(index, { ...held, bgmStop: stop });
  }

  protected setSpawnCount(index: number, count: string): void {
    const held = this.actions()[index];
    if (held?.kind === 'spawn') this.replace(index, { ...held, count: clampSwitchSpawn(count) });
  }

  protected setSpawnPlace(index: number, place: string): void {
    const held = this.actions()[index];
    if (held?.kind === 'spawn') this.replace(index, { ...held, place: place === 'presser' ? 'presser' : 'host' });
  }

  /** What the master has put out of sight, each with the kind of thing it is. */
  private readonly concealedChoices = computed<NameChoice[]>(() =>
    this.concealment.concealed().map((object) => ({ value: object.identifier, name: this.labelOf(object) }))
  );

  /** What stands on the table being looked at, each with the kind of thing it is. */
  private readonly concealableChoices = computed<NameChoice[]>(() =>
    this.concealment.concealable().map((object) => ({ value: object.identifier, name: this.labelOf(object) }))
  );

  /**
   * The pieces a spawn can copy: every piece in the room, wherever it is kept, each with where that
   * is. Each piece is followed, since moving one to the graveyard changes what it is listed as.
   */
  private readonly templateChoices = computed<NameChoice[]>(() => {
    this.objectChange.collectionOf(GameCharacter.aliasName)();
    return this.objectStore.getObjects<GameCharacter>(GameCharacter).map((piece) => {
      this.objectChange.versionOf(piece.identifier)();
      return { value: piece.identifier, name: this.templateLabelOf(piece) };
    });
  });

  private templateLabelOf(piece: GameCharacter): string {
    const place = piece.location.name;
    const where = ['table', 'graveyard', CONCEALED_LOCATION].includes(place) ? place : 'other';
    return listedThingLabel(piece.name, this.t(`feature.boardSwitch.where.${where}`), this.t);
  }

  private labelOf(object: TabletopObject): string {
    return listedThingLabel(object.name, this.t(`feature.boardSwitch.thing.${object.aliasName}`), this.t);
  }

  protected delaySeconds(action: SwitchAction): number {
    return action.delayMs / 1000;
  }

  protected add(kind: SwitchActionKind): void {
    if (this.full()) return;
    this.actionsChange.emit([...this.actions(), newSwitchAction(kind)]);
  }

  protected setKind(index: number, kind: string): void {
    const held = this.actions()[index];
    if (!held || !(SWITCH_ACTION_KINDS as readonly string[]).includes(kind)) return;
    const made = newSwitchAction(kind as SwitchActionKind);
    this.replace(index, { ...made, delayMs: held.delayMs });
  }

  protected setText(index: number, text: string): void {
    const held = this.actions()[index];
    if (held?.kind === 'say' || held?.kind === 'secret') this.replace(index, { ...held, text });
  }

  protected setReader(index: number, to: string): void {
    const held = this.actions()[index];
    if (held?.kind === 'secret') this.replace(index, { ...held, to: to === 'master' ? 'master' : 'presser' });
  }

  protected setName(index: number, name: string): void {
    const held = this.actions()[index];
    if (held && (held.kind === 'sound' || held.kind === 'effect' || held.kind === 'cutIn')) {
      this.replace(index, { ...held, name });
    }
  }

  protected setDelay(index: number, seconds: string): void {
    const held = this.actions()[index];
    if (held) this.replace(index, { ...held, delayMs: clampSwitchDelay(Number(seconds) * 1000) });
  }

  protected move(index: number, by: number): void {
    const list = [...this.actions()];
    const to = index + by;
    if (to < 0 || to >= list.length) return;
    [list[index], list[to]] = [list[to], list[index]];
    this.actionsChange.emit(list);
  }

  protected remove(index: number): void {
    this.actionsChange.emit(this.actions().filter((_, at) => at !== index));
  }

  private replace(index: number, action: SwitchAction): void {
    this.actionsChange.emit(this.actions().map((held, at) => (at === index ? action : held)));
  }
}
