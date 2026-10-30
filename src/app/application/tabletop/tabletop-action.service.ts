import { inject, Injectable } from '@angular/core';
import { ImageTagLockService } from '@axe/application/file/image-tag-lock.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerCoordinate } from '@axe/application/input/pointer-device.service';
import { PartyService } from '@axe/application/party/party.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import {
  type DiceMenuItem,
  type DicePlacement,
  getDicePlacements,
  getTrumpCardCodes,
  TERRAIN_TEXTURE_PATH,
  TRUMP_BACK_IMAGE_PATH,
} from '@axe/application/tabletop/tabletop-action-helpers';
import {
  makeDefaultTable as _makeDefaultTable,
  makeDefaultTabletopObjects as _makeDefaultTabletopObjects,
} from '@axe/application/tabletop/tabletop-default-setup';
import { ViewModePreferenceService } from '@axe/application/ui/view-mode-preference.service';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { GameObject } from '@axe/core/sync/game-object';
import { Card } from '@axe/domain/card/card';
import { CardStack } from '@axe/domain/card/card-stack';
import { toDeckCardSources } from '@axe/domain/card/deck-builder';
import { GameCharacter } from '@axe/domain/character/game-character';
import { Coin } from '@axe/domain/coin/coin';
import { DiceSymbol, DiceType } from '@axe/domain/dice/dice-symbol';
import { DisclosureMode } from '@axe/domain/disclosure/disclosure';
import { type AmbienceKind } from '@axe/domain/effect/ambience/ambience-kind';
import { canBrowseImage, ImageTag } from '@axe/domain/media/image-tag';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { Party } from '@axe/domain/party/party';
import { isAccountAvatar } from '@axe/domain/peer/account-avatar';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { cellIndexAt } from '@axe/domain/tabletop/fog/cell-grid';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { GameTableMask } from '@axe/domain/tabletop/game-table-mask';
import { LightSource } from '@axe/domain/tabletop/light-source';
import { gatherSpotsAround } from '@axe/domain/tabletop/move/gather-cells';
import { moveGridOf } from '@axe/domain/tabletop/move/move-grid';
import { occupiedCells } from '@axe/domain/tabletop/move/occupied-cells';
import { RangeArea } from '@axe/domain/tabletop/range';
import { TableAmbience } from '@axe/domain/tabletop/table-ambience';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { TextNote } from '@axe/domain/tabletop/text-note';
import { MAX_BOARD_PITCH, WhiteBoard } from '@axe/domain/tabletop/white-board';
import { laysFlat } from '@axe/domain/ui/view-mode';

/** How wide an ambient effect starts, in cells. One cell reads as nothing, so it arrives with some ground under it. */
const AMBIENCE_DEFAULT_SIZE = 4;

/** A board arrives big enough to lay a handful of pieces on without resizing it first. */
const BOARD_DEFAULT_WIDTH = 6;
const BOARD_DEFAULT_HEIGHT = 4;

@Injectable({
  providedIn: 'root',
})
export class TabletopActionService {
  private readonly imageStorage = inject(ImageStorage);
  private readonly tabletopService = inject(TabletopService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly tagLock = inject(ImageTagLockService);
  private readonly partyService = inject(PartyService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly tableSelecter = inject(TableSelecter);
  private readonly viewMode = inject(ViewModePreferenceService);
  private readonly t = inject(TRANSLATE_FN);

  constructor() {}

  /** Makes a character with the default name and no picture, centred on a point; see `createGameCharacterWith`. */
  createGameCharacter(position: PointerCoordinate): GameCharacter {
    return this.createGameCharacterWith(position, this.t('feature.tabletop.action.defaultCharacterName'), '');
  }

  /**
   * Makes a character with this name and picture, centred on a point.
   *
   * It belongs to whoever made it, and one made by the game master starts hidden from the players.
   */
  createGameCharacterWith(position: PointerCoordinate, name: string, imageIdentifier: string): GameCharacter {
    const character = GameCharacter.create(name, 1, imageIdentifier);
    character.location.x = position.x - this.halfCell();
    character.location.y = position.y - this.halfCell();
    character.posZ = position.z;
    this.applyCreationDefaults(character);
    return character;
  }

  private applyCreationDefaults(
    object: { owner: string; disclosureMode: string; update(): void },
    claimForCreator = true
  ): void {
    object.owner = claimForCreator ? (PeerCursor.myCursor?.userId ?? '') : '';
    if (PeerCursor.isMyselfGameMaster) object.disclosureMode = DisclosureMode.GameMaster;
    object.update();
  }

  /** Puts a five-by-five mask on the table in view. Nothing is made when no table is in view. */
  createGameTableMask(position: PointerCoordinate): GameTableMask | undefined {
    const viewTable = this.getViewTable();
    if (!viewTable) return undefined;

    const tableMask = GameTableMask.create(this.t('feature.tabletop.action.defaultMaskName'), 5, 5, 100);
    tableMask.location.x = position.x - this.halfCell();
    tableMask.location.y = position.y - this.halfCell();
    tableMask.posZ = position.z;

    viewTable.appendChild(tableMask);
    return tableMask;
  }

  /**
   * Puts a ground effect of this kind, a few cells across, on the table in view, centred on a
   * point.
   *
   * Nothing is made when no table is in view.
   */
  createTableAmbience(position: PointerCoordinate, kind: AmbienceKind): TableAmbience | undefined {
    const viewTable = this.getViewTable();
    if (!viewTable) return undefined;

    const size = AMBIENCE_DEFAULT_SIZE;
    const ambience = TableAmbience.create(this.t(`feature.ambience.kind.${kind}`), kind, size, size);
    const half = (size * viewTable.gridSize) / 2;
    ambience.location.x = position.x - half;
    ambience.location.y = position.y - half;
    ambience.posZ = position.z;

    viewTable.appendChild(ambience);
    return ambience;
  }

  /**
   * Puts a two-cell crate block on the table in view, registering its bundled texture the first
   * time.
   *
   * Nothing is made when no table is in view.
   */
  createTerrain(position: PointerCoordinate): Terrain | undefined {
    const url = TERRAIN_TEXTURE_PATH;
    let image = this.imageStorage.get(url);
    if (!image) {
      image = this.imageStorage.add(url);
      ImageTag.create(image.identifier).tag = '地形';
    }
    const viewTable = this.getViewTable();
    if (!viewTable) return undefined;

    const terrain = Terrain.create(
      this.t('feature.tabletop.action.defaultTerrainName'),
      2,
      2,
      2,
      image.identifier,
      image.identifier
    );
    terrain.location.x = position.x - viewTable.gridSize;
    terrain.location.y = position.y - viewTable.gridSize;
    terrain.posZ = position.z;

    viewTable.appendChild(terrain);
    return terrain;
  }

  /**
   * Puts a note with the default text at a point, owned by whoever made it.
   *
   * It stands upright unless this reader is looking at the table laid flat, and one made by the
   * game master starts hidden from the players.
   */
  createTextNote(position: PointerCoordinate): TextNote {
    const textNote = TextNote.create(
      this.t('feature.tabletop.action.defaultNoteName'),
      this.t('feature.tabletop.action.defaultNoteText'),
      5,
      4,
      3
    );
    textNote.location.x = position.x;
    textNote.location.y = position.y;
    textNote.posZ = position.z;
    // The seat's own view decides, as it does everywhere else: a reader who asked for
    // perspective on a table that recommends flat is looking at a standing board.
    textNote.isUpright = !laysFlat(this.viewMode.mode(), this.getViewTable()?.mode2d ?? false);
    this.applyCreationDefaults(textNote);
    return textNote;
  }

  /**
   * Lays a chat line on the table as a text note titled with the speaker's name, or the default
   * note name for a line with none; null, and no note, for a line with no words.
   *
   * The note is sized from the length and number of lines of the text, stood upright unless the
   * table is in 2D, and dropped near the table's centre.
   */
  layChatLineAsNote(speaker: string, words: string): TextNote | null {
    const text = words.trim();
    if (!text) return null;
    const title = speaker.trim() || this.t('feature.tabletop.action.defaultNoteName');
    const lines = text.split('\n');
    const longest = Math.max(...lines.map((line) => line.length));
    const width = Math.max(3, Math.min(8, Math.ceil(longest / 12)));
    const height = Math.max(2, Math.min(8, Math.ceil(lines.length / 3)));
    const note = TextNote.create(title, text, 14, width, height);
    note.isUpright = !this.tabletopService.mode2d();
    note.location.x = Math.floor(Math.random() * 200 - 100);
    note.location.y = Math.floor(Math.random() * 200 - 100);
    return note;
  }

  /**
   * Makes one die of a kind with its bundled face images, at the placement given or centred on the
   * point.
   *
   * The face images are registered the first time they are used. No sound is played; the caller
   * decides.
   */
  createDiceSymbol(
    position: PointerCoordinate,
    name: string,
    diceType: DiceType,
    imagePathPrefix: string,
    placement?: DicePlacement
  ): DiceSymbol {
    const diceSymbol = DiceSymbol.create(name, diceType, 1);
    diceSymbol.faces.forEach((face) => {
      const url: string = `./assets/images/dice/${imagePathPrefix}/${imagePathPrefix}[${face}].png`;
      let image = this.imageStorage.get(url);
      if (!image) {
        image = this.imageStorage.add(url);
      }
      const faceEl = diceSymbol.imageDataElement?.getFirstElementByName(face);
      if (faceEl) faceEl.value = image.identifier;
    });

    const place = placement ?? getDicePlacements(position, 1, this.tabletopService.gridSize())[0];
    diceSymbol.location.x = place.x;
    diceSymbol.location.y = place.y;
    diceSymbol.posZ = position.z;
    return diceSymbol;
  }

  /**
   * Makes several dice of one kind at once, laid out beside the point they were asked for.
   *
   * A handful of the same die is what a roll usually needs, and making them one press at a time
   * would leave them in a pile on one spot to be pulled apart by hand.
   */
  createDiceSymbols(
    position: PointerCoordinate,
    item: DiceMenuItem,
    count: number,
    ownership: { ownerCharacterIdentifier?: string; hiddenToOthers?: boolean } = {}
  ): DiceSymbol[] {
    const owner = ownership.hiddenToOthers === true ? PeerCursor.myUserId : '';
    return getDicePlacements(position, count, this.tabletopService.gridSize()).map((placement) => {
      const dice = this.createDiceSymbol(position, item.diceName, item.type, item.imagePathPrefix, placement);
      if (ownership.ownerCharacterIdentifier) dice.ownerCharacterIdentifier = ownership.ownerCharacterIdentifier;
      if (owner.length > 0) dice.owner = owner;
      return dice;
    });
  }

  /**
   * Makes a range of a shape named in the create menu at a point, at its default size and a lighter
   * opacity.
   *
   * A shape name it does not know is made as a cone.
   */
  createRangeArea(position: PointerCoordinate, typeName: string): RangeArea {
    let range;
    switch (typeName) {
      case 'LINE':
        range = RangeArea.create(this.t('feature.tabletop.action.defaultRangeName'), 1, 4, 100);
        break;
      case 'CIRCLE':
        range = RangeArea.create(this.t('feature.tabletop.action.defaultRangeName'), 3, 3, 100);
        break;
      case 'SQUARE':
      case 'RHOMBUS':
        range = RangeArea.create(this.t('feature.tabletop.action.defaultRangeName'), 3, 3, 100);
        break;
      case 'TRIANGLE':
        range = RangeArea.create(this.t('feature.tabletop.action.defaultRangeName'), 3, 3, 100);
        break;
      case 'PENTAGON':
        range = RangeArea.create(this.t('feature.tabletop.action.defaultRangeName'), 3, 3, 100);
        break;
      case 'HEXAGON':
        range = RangeArea.create(this.t('feature.tabletop.action.defaultRangeName'), 3, 3, 100);
        break;
      case 'CUSTOM':
        range = RangeArea.createCustom(this.t('feature.tabletop.action.defaultRangeName'), '0,0', 'square', 100, {
          isRotatable: false,
        });
        break;
      case 'CORN':
      default:
        range = RangeArea.create(this.t('feature.tabletop.action.defaultRangeName'), 3, 3, 100);
        break;
    }

    range.location.x = position.x;
    range.location.y = position.y;
    range.posZ = position.z;
    range.type = typeName;
    const data = range.commonDataElement?.getFirstElementByName('opacity');
    if (data) data.currentValue = 60;
    return range;
  }

  /**
   * A board is put up where a board goes: standing, behind the map, the size of the map.
   *
   * Laid flat over the middle of the table it covers the very thing everyone is looking at,
   * and at six squares by four it is too small to write anything on. It stands a square clear
   * of the north edge instead, as wide as the table it stands behind.
   */
  createWhiteBoard(_position: PointerCoordinate): WhiteBoard {
    const table = this.getViewTable();
    const width = table?.width ?? BOARD_DEFAULT_WIDTH;
    const height = table?.height ?? BOARD_DEFAULT_HEIGHT;
    const grid = table?.gridSize ?? 50;

    const board = WhiteBoard.create(this.t('feature.whiteBoard.defaultName'), width, height, 1);
    board.pitch = MAX_BOARD_PITCH;
    // Standing, a board hinges on its bottom edge, so its foot is a square north of the table.
    // A second board is set down beside the first rather than on top of it, where it would
    // cover a board of the same size exactly and read as having taken its place.
    board.location.x = freeBoardSpot(table?.whiteBoards ?? [], width * grid + grid);
    board.location.y = -(grid + height * grid);
    board.posZ = 0;
    // A board belongs to its table, the way terrain does, so clearing the table clears it.
    table?.appendChild(board);
    board.update();
    return board;
  }

  /** Puts a light on the table in view, centred on a point and owned by whoever made it. */
  createLightSource(position: PointerCoordinate): LightSource {
    const light = LightSource.create(this.t('feature.tabletop.action.defaultLightName'));
    light.location.x = position.x - this.halfCell();
    light.location.y = position.y - this.halfCell();
    light.posZ = position.z;
    light.owner = PeerCursor.myCursor?.userId ?? '';
    // A light belongs to its table, so clearing the table takes its lights with it.
    this.getViewTable()?.appendChild(light);
    light.update();
    return light;
  }

  /** Makes a stack of a full deck of playing cards and two jokers, registering the bundled card images on first use. */
  createTrump(position: PointerCoordinate): CardStack {
    const cardStack = CardStack.create(this.t('feature.tabletop.action.defaultTrumpStackName'));
    cardStack.location.x = position.x - this.halfCell();
    cardStack.location.y = position.y - this.halfCell();
    cardStack.posZ = position.z;

    const back = TRUMP_BACK_IMAGE_PATH;
    if (!this.imageStorage.get(back)) {
      const image = this.imageStorage.add(back);
      ImageTag.create(image.identifier).tag = 'トランプ';
    }
    for (const trump of getTrumpCardCodes()) {
      const url: string = './assets/images/trump/' + trump + '.webp';
      if (!this.imageStorage.get(url)) {
        const image = this.imageStorage.add(url);
        ImageTag.create(image.identifier).tag = 'トランプ';
      }
      const card = Card.create(this.t('feature.tabletop.action.defaultCardName'), url, back);
      cardStack.putOnBottom(card);
    }
    return cardStack;
  }

  /** Create a face-up standalone card that can be filled without preparing an image. */
  createBlankCard(position: PointerCoordinate): Card {
    const front = './assets/images/trump/blank_card.webp';
    const back = TRUMP_BACK_IMAGE_PATH;

    if (!this.imageStorage.get(front)) {
      const image = this.imageStorage.add(front);
      ImageTag.create(image.identifier).tag = 'トランプ';
    }
    if (!this.imageStorage.get(back)) {
      const image = this.imageStorage.add(back);
      ImageTag.create(image.identifier).tag = 'トランプ';
    }

    const card = Card.create(this.t('feature.tabletop.action.defaultCardName'), front, back);
    card.location.x = position.x - this.halfCell();
    card.location.y = position.y - this.halfCell();
    card.posZ = position.z;
    card.faceUp();
    // Card ownership means "show only to me", so a newly created public card must remain unclaimed.
    this.applyCreationDefaults(card, false);
    return card;
  }

  /** Makes the first table a new room opens on; see `makeDefaultTable` in the default setup. */
  makeDefaultTable() {
    _makeDefaultTable(this.imageStorage);
  }

  /** Sets out the sample pieces a new room opens with. */
  makeDefaultTabletopObjects() {
    _makeDefaultTabletopObjects(this.imageStorage);
  }

  /**
   * Standing a party's pieces around one spot, the nearest ground first.
   *
   * The spot itself is taken and the rest are laid around it, so a party gathered on a doorway
   * stands in the doorway rather than in a row running off it. Ground anybody else is standing
   * on is left alone, and the pieces being gathered give up the ground they were on, so a party
   * asked to gather where it already stands does not have to squeeze past itself.
   *
   * A member that is not on the table is left where it is unless it was asked for by name: a
   * piece that was put away was put away on purpose. Answers with how many were placed.
   */
  gatherParty(position: PointerCoordinate, party: Party, bringInAway = false): number {
    const table = this.getViewTable();
    if (!table || table.gridSize <= 0) return 0;
    const members = this.partyService.membersOf(party.identifier);
    if (members.length === 0) return 0;

    const gathering = bringInAway ? members : members.filter((member) => member.isVisibleOnTable);
    if (gathering.length === 0) return 0;

    const grid = moveGridOf(table);
    const start = cellIndexAt(grid, position.x, position.y);
    if (start < 0) return 0;

    const moving = new Set(gathering.map((member) => member.identifier));
    const standing = this.partyService.characters().filter((character) => !moving.has(character.identifier));
    const spots = GameObject.batch(() => {
      const placed = gatherSpotsAround(grid, table.gridSize, start, gathering, occupiedCells(grid, standing, ''));
      for (const spot of placed) {
        if (!spot.character.isVisibleOnTable) spot.character.setLocation('table');
        spot.character.location.x = spot.x;
        spot.character.location.y = spot.y;
        spot.character.location.surface = undefined;
        spot.character.posZ = 0;
        spot.character.update();
      }
      return placed;
    });
    for (const spot of spots) this.objectChange.notifyChanged(spot.character.identifier);
    if (spots.length > 0) SoundEffect.play(PresetSound.piecePut);
    return spots.length;
  }

  /**
   * Makes a deck of cards from every image carrying a tag, backed with the playing card back.
   *
   * Images kept back from this reader are left out. Cards are named after their images or given the
   * default name. Answers null when no image qualifies.
   */
  createDeckFromTag(position: PointerCoordinate, tag: string, useImageName: boolean): CardStack | null {
    // A picture the master is keeping back is not dealt onto the table by anyone else, nor one
    // under a tag someone keeps to themselves by anyone but them and the master.
    const images = this.imageStorage.images.filter(
      (image) =>
        !isAccountAvatar(image.identifier) &&
        (ImageTag.get(image.identifier)?.tag ?? '') === tag &&
        canBrowseImage(
          ImageTag.get(image.identifier) ?? null,
          this.rolePermission.canSeeHidden(),
          true,
          this.tagLock.hides
        )
    );
    const sources = toDeckCardSources(images, this.t('feature.tabletop.action.defaultCardName'));
    if (sources.length < 1) return null;

    const cardStack = CardStack.create(tag.length > 0 ? tag : this.t('feature.tabletop.action.defaultDeckName'));
    cardStack.location.x = position.x - this.halfCell();
    cardStack.location.y = position.y - this.halfCell();
    cardStack.posZ = position.z;

    const back = TRUMP_BACK_IMAGE_PATH;
    if (!this.imageStorage.get(back)) this.imageStorage.add(back);

    for (const source of sources) {
      const name = useImageName ? source.name : this.t('feature.tabletop.action.defaultCardName');
      cardStack.putOnBottom(Card.create(name, source.identifier, back));
    }
    return cardStack;
  }

  /** Makes a coin centred on a point, on top of everything else there. */
  createCoin(position: PointerCoordinate): Coin {
    const coin = Coin.create(this.t('feature.tabletop.action.defaultCoinName'));
    coin.location.x = position.x - this.halfCell();
    coin.location.y = position.y - this.halfCell();
    coin.posZ = position.z;
    coin.toTopmost();
    return coin;
  }

  private getViewTable(): GameTable | null {
    return this.tableSelecter.viewTable;
  }

  /** Half a cell of the table in view, by which a new piece is drawn back so that it sits under the pointer. */
  private halfCell(): number {
    return this.tabletopService.gridSize() / 2;
  }
}

/** The first spot in the row north of the table that no board is standing in already. */
export function freeBoardSpot(standing: readonly { location: { x: number } }[], step: number): number {
  const taken = new Set(standing.map((board) => Math.round(board.location.x)));
  for (let spot = 0; spot <= taken.size * step; spot += step) {
    if (!taken.has(spot)) return spot;
  }
  return (taken.size + 1) * step;
}
