import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BattleCutInPreferenceService } from '@axe/application/battle/battle-cut-in-preference.service';
import { BattleLaunchService } from '@axe/application/battle/battle-launch.service';
import { EffectLibraryService } from '@axe/application/effect/effect-library.service';
import { PartyService } from '@axe/application/party/party.service';
import { DisclosureService } from '@axe/application/permission/disclosure.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { asBattleSide, BattleSide } from '@axe/domain/battle/battle-lineup';
import {
  BATTLE_GENRES,
  BATTLE_PICTURE_LIMIT,
  BATTLE_TIMES,
  BattleSettings,
  BattleTheme,
  battleThemeOf,
} from '@axe/domain/battle/battle-settings';
import { putOnBattleSide, standingBattleSide } from '@axe/domain/battle/battle-side';
import { BATTLE_STAGE_SIZE_LABEL_KEYS, BATTLE_STAGE_SIZES } from '@axe/domain/battle/battle-stage-window';
import { GameCharacter } from '@axe/domain/character/game-character';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { Party } from '@axe/domain/party/party';
import { Config } from '@axe/domain/peer/config';
import { TurnState } from '@axe/domain/tabletop/turn-state';
import { battleThemeLook } from '@axe/features/battle-cut-in/battle-themes';
import { EffectPreviewComponent } from '@axe/features/effect/effect-preview/effect-preview.component';
import { FileSelecterComponent } from '@axe/ui/components/file-selecter/file-selecter.component';
import { TranslocoModule } from '@jsverse/transloco';

/** A piece out on the table, as the panel lists it. */
export interface BattlePieceRow {
  identifier: string;
  name: string;
  imageUrl: string;
  side: BattleSide | null;
  /** Whether it stands where its party does, rather than where it was put on its own. */
  withParty: boolean;
  /** Whether its party stands on a side, which it may be sent back to. */
  partyPlaced: boolean;
  /** The effect it strikes with, by name. Empty strikes with the stage's own. */
  effect: string;
}

/** A party of the room, as the panel offers to put it on a side. */
export interface BattlePartyRow {
  identifier: string;
  name: string;
  color: string;
  side: BattleSide | null;
}

/** A picture the room keeps to fight on, as the panel offers it. */
export interface BattlePictureChoice {
  identifier: string;
  name: string;
  /** Empty while the picture has not arrived on this screen. */
  url: string;
}

/** The effects of one family, as the selects list them. */
export interface EffectGroup {
  tag: string;
  names: string[];
}

/**
 * The battle stage, set up and played from one place.
 *
 * Anybody may turn the stage off for their own screen, play the lineup for the room or only for
 * themselves, and choose the effect their own pieces strike with. The master puts the pieces on
 * the two sides and sets how the stage looks and how a fighter goes down.
 */
@Component({
  selector: 'battle-cut-in-panel',
  templateUrl: './battle-cut-in-panel.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, NgTemplateOutlet, TranslocoModule, EffectPreviewComponent],
})
export class BattleCutInPanelComponent {
  protected readonly preference = inject(BattleCutInPreferenceService);
  protected readonly stageSizes = BATTLE_STAGE_SIZES;
  protected readonly stageSizeLabelKeys = BATTLE_STAGE_SIZE_LABEL_KEYS;
  private readonly launch = inject(BattleLaunchService);
  private readonly library = inject(EffectLibraryService);
  private readonly permission = inject(RolePermissionService);
  private readonly disclosure = inject(DisclosureService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly objectStore = inject(ObjectStore);
  private readonly modal = inject(ModalService);
  private readonly images = inject(ImageStorage);
  private readonly partyService = inject(PartyService);

  /** The sides a party may be put on, in the order the buttons stand. */
  protected readonly partySideChoices: readonly { key: string; side: BattleSide | null; labelKey: string }[] = [
    { key: 'left', side: 'left', labelKey: 'feature.battleCutIn.left' },
    { key: 'none', side: null, labelKey: 'feature.battleCutIn.partyNone' },
    { key: 'right', side: 'right', labelKey: 'feature.battleCutIn.right' },
  ];
  protected readonly partySideButtonClass =
    'border-ui-border-panel bg-ui-input text-ui-muted aria-pressed:border-ui-accent aria-pressed:bg-ui-accent-bg aria-pressed:text-ui-accent hover:border-ui-accent m-0 -ml-px cursor-pointer border border-solid px-2 py-0.5 text-[11px] first:ml-0 first:rounded-l-[3px] last:rounded-r-[3px]';
  /** The colours the two sides are marked in, as the stage marks the fighters' plates. */
  protected readonly sideColors = { left: 'rgb(56 189 248 / 0.6)', right: 'rgb(251 113 133 / 0.6)' };
  /** The tool's own stages, the nights and then the days, each with a small copy of its picture to choose by. */
  protected readonly themeRows = BATTLE_TIMES.map((time) => ({
    time,
    choices: BATTLE_GENRES.map((genre) => {
      const theme = battleThemeOf(genre, time);
      return { theme, genre, thumbnail: battleThemeLook(theme).thumbnail };
    }),
  }));
  protected readonly pictureLimit = BATTLE_PICTURE_LIMIT;

  /** Whether the reader runs the game, and so sets the lineup and the room's stage up. */
  readonly isGameMaster = computed(() => this.permission.isGameMaster());
  /** Whether the reader may play the stage for the whole room, as one who only watches may not. */
  readonly canEditTable = computed(() => this.permission.canEditTabletop());

  /** Whether the last press of a play button found no bout to play. */
  readonly noBout = signal(false);

  /**
   * The pieces out on the table. Every piece is followed rather than those out now, since one
   * brought back from the graveyard changes where it stands but not how many pieces there are.
   */
  private readonly pieces = computed<GameCharacter[]>(() => {
    this.objectChange.collectionOf(GameCharacter.aliasName)();
    return this.objectStore.getObjects<GameCharacter>(GameCharacter).filter((character) => {
      this.objectChange.versionOf(character.identifier)();
      return character.isVisibleOnTable;
    });
  });

  /** The room's parties, each with the side its members stand on where they were put on none. */
  readonly parties = computed<BattlePartyRow[]>(() =>
    this.partyService.parties().map((party) => ({
      identifier: party.identifier,
      name: party.name,
      color: party.color,
      side: asBattleSide(party.battleSide),
    }))
  );

  readonly rows = computed<BattlePieceRow[]>(() => {
    this.objectChange.fileVersion();
    const placed = new Set(this.parties().flatMap((party) => (party.side ? [party.identifier] : [])));
    return this.pieces().map((character) => {
      const partyPlaced = placed.has(character.partyIdentifier);
      return {
        identifier: character.identifier,
        name: character.name,
        imageUrl: character.imageFile.url,
        side: standingBattleSide(character),
        withParty: partyPlaced && character.battleSide === '',
        partyPlaced,
        effect: character.battleEffect,
      };
    });
  });

  readonly left = computed(() => this.rows().filter((row) => row.side === 'left'));
  readonly right = computed(() => this.rows().filter((row) => row.side === 'right'));
  readonly others = computed(() => this.rows().filter((row) => row.side === null));

  /** Who would strike whom if the lineup were played now. Null where it has no bout to play. */
  readonly bout = computed(() => {
    this.objectChange.versionOf('TurnState')();
    this.rows();
    const bout = this.launch.lineupBout(null);
    if (!bout) return null;
    const nameOf = (identifier: string) => this.rows().find((row) => row.identifier === identifier)?.name ?? '';
    return {
      attacker: nameOf(bout.attacker),
      byTurn: bout.attacker === TurnState.instance.currentIdentifier,
      defenders: bout.defenders.map(nameOf).join('、'),
    };
  });

  /** The piece whose effect is being chosen: the one the panel was opened for, else the first listed. */
  readonly focus = linkedSignal<BattlePieceRow[], string>({
    source: () => this.rows(),
    computation: (rows, previous) => {
      const held = previous?.value ?? '';
      return rows.some((row) => row.identifier === held) ? held : (rows[0]?.identifier ?? '');
    },
  });

  readonly focused = computed(() => this.rows().find((row) => row.identifier === this.focus()) ?? null);

  /** Whether the reader may choose the effect of the piece in focus: one they may change and look into. */
  readonly canEditFocused = computed(() => {
    const piece = this.pieceOf(this.focus());
    if (!piece || !this.canEditTable()) return false;
    this.objectChange.trackMyCursor();
    return this.disclosure.canView(piece);
  });

  readonly focusedPreset = computed<EffectPreset | null>(() => {
    const name = this.focused()?.effect.trim() ?? '';
    return name.length > 0 ? (this.library.presets().find((preset) => preset.name.trim() === name) ?? null) : null;
  });

  /** Every effect the reader may name, family by family; one kept to the master is left out for the others. */
  readonly effectGroups = computed<EffectGroup[]>(() => {
    const master = this.isGameMaster();
    const groups = new Map<string, string[]>();
    for (const preset of this.library.presets()) {
      if (preset.gmOnly && !master) continue;
      const name = preset.name.trim();
      if (name.length < 1) continue;
      const tag = preset.tagName.trim();
      const names = groups.get(tag) ?? [];
      if (!names.includes(name)) names.push(name);
      groups.set(tag, names);
    }
    return [...groups].map(([tag, names]) => ({ tag, names }));
  });

  readonly settings = computed<BattleSettings>(() => {
    this.objectChange.versionOf(Config.instance.identifier)();
    return Config.instance.battleSettings;
  });

  /** The pictures the room keeps to fight on, each as far as it has arrived on this screen. */
  readonly pictures = computed<BattlePictureChoice[]>(() => {
    this.objectChange.fileVersion();
    return this.settings().pictures.map((identifier) => {
      const image = this.images.get(identifier);
      return { identifier, name: image?.name ?? '', url: image?.url ?? '' };
    });
  });

  readonly picturesFull = computed(() => this.settings().pictures.length >= BATTLE_PICTURE_LIMIT);

  /** Opens the panel on a piece, to choose what it strikes with. */
  focusOn(identifier: string): void {
    this.focus.set(identifier);
  }

  /** Puts a piece on a side, or takes it out of the lineup; see {@link putOnBattleSide}. */
  setSide(identifier: string, side: BattleSide | null): void {
    const piece = this.pieceOf(identifier);
    if (!piece || !this.isGameMaster()) return;
    putOnBattleSide(piece, side);
  }

  /** Sends a piece back to stand where its party does. */
  followParty(identifier: string): void {
    const piece = this.pieceOf(identifier);
    if (!piece || !this.isGameMaster()) return;
    piece.battleSide = '';
  }

  /** Puts a party on a side of the stage, or on neither, for every member not put on one of its own. */
  setPartySide(identifier: string, side: BattleSide | null): void {
    const party = this.objectStore.get(identifier);
    if (!(party instanceof Party) || !this.isGameMaster()) return;
    party.battleSide = side ?? '';
    this.objectChange.notifyChanged(party.identifier);
  }

  setEffect(name: string): void {
    const piece = this.pieceOf(this.focus());
    if (!piece || !this.canEditFocused()) return;
    piece.battleEffect = name.trim();
  }

  /** Plays the lineup for the whole room. */
  playForRoom(): void {
    if (!this.canEditTable()) return;
    this.noBout.set(this.launch.playLineup(null, 'everywhere') === null);
  }

  /** Plays the lineup on this screen alone, to see how it looks. */
  playHere(): void {
    this.noBout.set(this.launch.playLineup(null, 'here') === null);
  }

  setTheme(theme: BattleTheme): void {
    this.updateSettings({ theme, background: '' });
  }

  /** Adds a picture for the room to fight on, and fights on it. */
  addPicture(): void {
    if (!this.isGameMaster() || this.picturesFull()) return;
    this.modal.open<string>(FileSelecterComponent).then((identifier) => {
      if (!identifier) return;
      const pictures = Config.instance.battleSettings.pictures;
      this.updateSettings({
        pictures: pictures.includes(identifier) ? pictures : [...pictures, identifier],
        background: identifier,
      });
    });
  }

  setPicture(identifier: string): void {
    this.updateSettings({ background: identifier });
  }

  /** Lets a picture go; where the stage was drawn on it, the stage chosen comes back. */
  removePicture(identifier: string): void {
    const { pictures, background } = Config.instance.battleSettings;
    this.updateSettings({
      pictures: pictures.filter((picture) => picture !== identifier),
      background: background === identifier ? '' : background,
    });
  }

  setDefeat(defeat: boolean): void {
    this.updateSettings({ defeat });
  }

  setDefeatResource(name: string): void {
    this.updateSettings({ defeatResource: name });
  }

  setDefeatEffect(name: string): void {
    this.updateSettings({ defeatEffect: name });
  }

  private updateSettings(change: Partial<BattleSettings>): void {
    if (!this.isGameMaster()) return;
    Config.instance.battleSettings = { ...Config.instance.battleSettings, ...change };
  }

  private pieceOf(identifier: string): GameCharacter | null {
    return this.pieces().find((piece) => piece.identifier === identifier) ?? null;
  }
}
