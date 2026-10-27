import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BattleCutInPreferenceService } from '@axe/application/battle/battle-cut-in-preference.service';
import { BattleLaunchService } from '@axe/application/battle/battle-launch.service';
import { EffectLibraryService } from '@axe/application/effect/effect-library.service';
import { DisclosureService } from '@axe/application/permission/disclosure.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { asBattleSide, BattleSide } from '@axe/domain/battle/battle-lineup';
import { BattleSettings } from '@axe/domain/battle/battle-settings';
import { GameCharacter } from '@axe/domain/character/game-character';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { Config } from '@axe/domain/peer/config';
import { TurnState } from '@axe/domain/tabletop/turn-state';
import { EffectPreviewComponent } from '@axe/features/effect/effect-preview/effect-preview.component';
import { FileSelecterComponent } from '@axe/ui/components/file-selecter/file-selecter.component';
import { TranslocoModule } from '@jsverse/transloco';

/** A piece out on the table, as the panel lists it. */
export interface BattlePieceRow {
  identifier: string;
  name: string;
  imageUrl: string;
  side: BattleSide | null;
  /** The effect it strikes with, by name. Empty strikes with the stage's own. */
  effect: string;
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
  private readonly launch = inject(BattleLaunchService);
  private readonly library = inject(EffectLibraryService);
  private readonly permission = inject(RolePermissionService);
  private readonly disclosure = inject(DisclosureService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly objectStore = inject(ObjectStore);
  private readonly modal = inject(ModalService);
  private readonly images = inject(ImageStorage);

  /** The colours the two sides are marked in, as the stage marks the fighters' plates. */
  protected readonly sideColors = { left: 'rgb(56 189 248 / 0.6)', right: 'rgb(251 113 133 / 0.6)' };
  /** The stage's own backdrop, shown small where the room has no picture of its own. */
  protected readonly stageThumbnail = 'linear-gradient(to bottom, #2b2466, #e0875a 50%, #22160f 51%)';

  /** Whether the reader runs the game, and so sets the lineup and the room's stage up. */
  readonly isGameMaster = computed(() => this.permission.isGameMaster());
  private readonly canEditTable = computed(() => this.permission.canEditTabletop());

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

  readonly rows = computed<BattlePieceRow[]>(() =>
    this.pieces().map((character) => ({
      identifier: character.identifier,
      name: character.name,
      imageUrl: character.imageFile.url,
      side: asBattleSide(character.battleSide),
      effect: character.battleEffect,
    }))
  );

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

  readonly backgroundUrl = computed(() => {
    const identifier = this.settings().background;
    return identifier.length > 0 ? (this.images.get(identifier)?.url ?? '') : '';
  });

  /** Opens the panel on a piece, to choose what it strikes with. */
  focusOn(identifier: string): void {
    this.focus.set(identifier);
  }

  setSide(identifier: string, side: BattleSide | null): void {
    const piece = this.pieceOf(identifier);
    if (!piece || !this.isGameMaster()) return;
    piece.battleSide = side ?? '';
  }

  setEffect(name: string): void {
    const piece = this.pieceOf(this.focus());
    if (!piece || !this.canEditFocused()) return;
    piece.battleEffect = name.trim();
  }

  /** Plays the lineup for the whole room. */
  playForRoom(): void {
    this.noBout.set(this.launch.playLineup(null, 'everywhere') === null);
  }

  /** Plays the lineup on this screen alone, to see how it looks. */
  playHere(): void {
    this.noBout.set(this.launch.playLineup(null, 'here') === null);
  }

  chooseBackground(): void {
    if (!this.isGameMaster()) return;
    this.modal.open<string>(FileSelecterComponent, { isAllowedEmpty: true }).then((identifier) => {
      if (identifier) this.updateSettings({ background: identifier });
    });
  }

  clearBackground(): void {
    this.updateSettings({ background: '' });
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
