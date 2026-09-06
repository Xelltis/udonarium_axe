import { inject, Injectable } from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerCoordinate } from '@axe/application/input/pointer-device.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import {
  getDiceMenuItems,
  getRangeMenuItems,
  getTrumpCardCodes,
  TERRAIN_TEXTURE_PATH,
  TRUMP_BACK_IMAGE_PATH,
} from '@axe/application/tabletop/tabletop-action-helpers';
import { initAprilDiceImages } from '@axe/application/tabletop/tabletop-default-dice';
import {
  makeDefaultTable as _makeDefaultTable,
  makeDefaultTabletopObjects as _makeDefaultTabletopObjects,
} from '@axe/application/tabletop/tabletop-default-setup';
import { ContextMenuAction } from '@axe/application/ui/context-menu.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { TabletopDisplaySettingsService } from '@axe/application/ui/tabletop-display-settings.service';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { Card } from '@axe/domain/card/card';
import { CardStack } from '@axe/domain/card/card-stack';
import { toDeckCardSources } from '@axe/domain/card/deck-builder';
import { GameCharacter } from '@axe/domain/character/game-character';
import { Coin } from '@axe/domain/coin/coin';
import { DiceSymbol, DiceType } from '@axe/domain/dice/dice-symbol';
import { DisclosureMode } from '@axe/domain/disclosure/disclosure';
import { type AmbienceKind, GROUND_AMBIENCE_KINDS } from '@axe/domain/effect/ambience/ambience-kind';
import { canBrowseImage, ImageTag } from '@axe/domain/media/image-tag';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { GameTableMask } from '@axe/domain/tabletop/game-table-mask';
import { GameTableScratchMask } from '@axe/domain/tabletop/game-table-scratch-mask';
import { LightSource } from '@axe/domain/tabletop/light-source';
import { RangeArea } from '@axe/domain/tabletop/range';
import { TableAmbience } from '@axe/domain/tabletop/table-ambience';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { TextNote } from '@axe/domain/tabletop/text-note';
import { MAX_BOARD_PITCH, WhiteBoard } from '@axe/domain/tabletop/white-board';

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
  private readonly rolePermission = inject(RolePermissionService);
  private readonly tableSelecter = inject(TableSelecter);
  private readonly selectionSignalService = inject(SelectionSignalService);
  private readonly tabletopDisplay = inject(TabletopDisplaySettingsService);
  private readonly t = inject(TRANSLATE_FN);

  constructor() {}

  createGameCharacter(position: PointerCoordinate): GameCharacter {
    return this.createGameCharacterWith(position, this.t('feature.tabletop.action.defaultCharacterName'), '');
  }

  createGameCharacterWith(position: PointerCoordinate, name: string, imageIdentifier: string): GameCharacter {
    const character = GameCharacter.create(name, 1, imageIdentifier);
    character.location.x = position.x - 25;
    character.location.y = position.y - 25;
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

  createGameTableMask(position: PointerCoordinate): GameTableMask | undefined {
    const viewTable = this.getViewTable();
    if (!viewTable) return undefined;

    const tableMask = GameTableMask.create(this.t('feature.tabletop.action.defaultMaskName'), 5, 5, 100);
    tableMask.location.x = position.x - 25;
    tableMask.location.y = position.y - 25;
    tableMask.posZ = position.z;

    viewTable.appendChild(tableMask);
    return tableMask;
  }

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

  createGameTableScratchMask(position: PointerCoordinate): GameTableScratchMask | undefined {
    const viewTable = this.getViewTable();
    if (!viewTable) return undefined;

    const tableMask = GameTableScratchMask.create(
      this.t('feature.tabletop.action.defaultScratchMaskName'),
      10,
      10,
      100
    );
    tableMask.location.x = position.x - 25;
    tableMask.location.y = position.y - 25;
    tableMask.posZ = position.z;

    viewTable.appendChild(tableMask);
    return tableMask;
  }

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
    terrain.location.x = position.x - 50;
    terrain.location.y = position.y - 50;
    terrain.posZ = position.z;

    viewTable.appendChild(terrain);
    return terrain;
  }

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
    textNote.isUpright = !((this.getViewTable()?.mode2d ?? false) || this.tabletopDisplay.enabled());
    this.applyCreationDefaults(textNote);
    return textNote;
  }

  createDiceSymbol(position: PointerCoordinate, name: string, diceType: DiceType, imagePathPrefix: string): DiceSymbol {
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

    diceSymbol.location.x = position.x - 25;
    diceSymbol.location.y = position.y - 25;
    diceSymbol.posZ = position.z;
    return diceSymbol;
  }

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

  createLightSource(position: PointerCoordinate): LightSource {
    const light = LightSource.create(this.t('feature.tabletop.action.defaultLightName'));
    light.location.x = position.x - 25;
    light.location.y = position.y - 25;
    light.posZ = position.z;
    light.owner = PeerCursor.myCursor?.userId ?? '';
    // A light belongs to its table, so clearing the table takes its lights with it.
    this.getViewTable()?.appendChild(light);
    light.update();
    return light;
  }

  createTrump(position: PointerCoordinate): CardStack {
    const cardStack = CardStack.create(this.t('feature.tabletop.action.defaultTrumpStackName'));
    cardStack.location.x = position.x - 25;
    cardStack.location.y = position.y - 25;
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
    card.location.x = position.x - 25;
    card.location.y = position.y - 25;
    card.posZ = position.z;
    card.faceUp();
    // Card ownership means "show only to me", so a newly created public card must remain unclaimed.
    this.applyCreationDefaults(card, false);
    return card;
  }

  makeDefaultTable() {
    _makeDefaultTable(this.imageStorage);
  }

  initAprilDiceImage() {
    initAprilDiceImages(this.imageStorage);
  }

  makeDefaultTabletopObjects() {
    _makeDefaultTabletopObjects(this.imageStorage);
  }

  makeDefaultContextMenuActions(position: PointerCoordinate): ContextMenuAction[] {
    return this.makeDefaultContextMenuActionGroups(position).flat();
  }

  // The create items come in two halves so a rotating menu can spread them over two spokes
  // instead of piling every one of them onto a single group.
  makeDefaultContextMenuActionGroups(position: PointerCoordinate): ContextMenuAction[][] {
    return [
      [
        this.getCreateCharacterMenu(position),
        this.getCreateTableMaskMenu(position),
        this.getCreateTerrainMenu(position),
        this.getCreateTextNoteMenu(position),
        this.getCreateBlankCardMenu(position),
        this.getCreateTrumpMenu(position),
        this.getCreateDiceSymbolMenu(position),
      ],
      [
        this.getCreateCoinMenu(position),
        this.getCreateRangeMenu(position),
        this.getCreateLightSourceMenu(position),
        this.getCreateWhiteBoardMenu(position),
        this.getCreateAmbienceMenu(position),
      ],
    ];
  }

  private getCreateAmbienceMenu(position: PointerCoordinate): ContextMenuAction {
    return {
      name: this.t('feature.tabletop.action.createAmbience'),
      action: undefined,
      subActions: GROUND_AMBIENCE_KINDS.map((kind) => ({
        name: this.t(`feature.ambience.kind.${kind}`),
        action: () => {
          this.createTableAmbience(position, kind);
          SoundEffect.play(PresetSound.cardPut);
        },
      })),
    };
  }

  private getCreateCharacterMenu(position: PointerCoordinate): ContextMenuAction {
    return {
      name: this.t('feature.tabletop.action.createCharacter'),
      action: () => {
        const character = this.createGameCharacter(position);
        this.selectionSignalService.selectObject(character.identifier, character.aliasName);
        SoundEffect.play(PresetSound.piecePut);
      },
    };
  }

  private getCreateTableMaskMenu(position: PointerCoordinate): ContextMenuAction {
    return {
      name: this.t('feature.tabletop.action.createMask'),
      action: () => {
        this.createGameTableMask(position);
        SoundEffect.play(PresetSound.cardPut);
      },
    };
  }

  private getCreateTerrainMenu(position: PointerCoordinate): ContextMenuAction {
    return {
      name: this.t('feature.tabletop.action.createTerrain'),
      action: () => {
        this.createTerrain(position);
        SoundEffect.play(PresetSound.blockPut);
      },
    };
  }

  private getCreateTextNoteMenu(position: PointerCoordinate): ContextMenuAction {
    return {
      name: this.t('feature.tabletop.action.createNote'),
      action: () => {
        this.createTextNote(position);
        SoundEffect.play(PresetSound.cardPut);
      },
    };
  }

  private getCreateTrumpMenu(position: PointerCoordinate): ContextMenuAction {
    return {
      name: this.t('feature.tabletop.action.createTrump'),
      action: () => {
        this.createTrump(position);
        SoundEffect.play(PresetSound.cardPut);
      },
    };
  }

  private getCreateBlankCardMenu(position: PointerCoordinate): ContextMenuAction {
    return {
      name: this.t('feature.tabletop.action.createBlankCard'),
      action: () => {
        this.createBlankCard(position);
        SoundEffect.play(PresetSound.cardPut);
      },
    };
  }

  createDeckFromTag(position: PointerCoordinate, tag: string, useImageName: boolean): CardStack | null {
    // A picture the master is keeping back is not dealt onto the table by anyone else.
    const images = this.imageStorage.images.filter(
      (image) =>
        (ImageTag.get(image.identifier)?.tag ?? '') === tag &&
        canBrowseImage(ImageTag.get(image.identifier) ?? null, this.rolePermission.canSeeHidden)
    );
    const sources = toDeckCardSources(images, this.t('feature.tabletop.action.defaultCardName'));
    if (sources.length < 1) return null;

    const cardStack = CardStack.create(tag.length > 0 ? tag : this.t('feature.tabletop.action.defaultDeckName'));
    cardStack.location.x = position.x - 25;
    cardStack.location.y = position.y - 25;
    cardStack.posZ = position.z;

    const back = TRUMP_BACK_IMAGE_PATH;
    if (!this.imageStorage.get(back)) this.imageStorage.add(back);

    for (const source of sources) {
      const name = useImageName ? source.name : this.t('feature.tabletop.action.defaultCardName');
      cardStack.putOnBottom(Card.create(name, source.identifier, back));
    }
    return cardStack;
  }

  private getCreateDiceSymbolMenu(position: PointerCoordinate): ContextMenuAction {
    const subMenus: ContextMenuAction[] = [];

    getDiceMenuItems().forEach((item) => {
      subMenus.push({
        name: item.menuName,
        action: () => {
          this.createDiceSymbol(position, item.diceName, item.type, item.imagePathPrefix);
          SoundEffect.play(PresetSound.dicePut);
        },
      });
    });
    return { name: this.t('feature.tabletop.action.createDice'), action: undefined, subActions: subMenus };
  }

  createCoin(position: PointerCoordinate): Coin {
    const coin = Coin.create(this.t('feature.tabletop.action.defaultCoinName'));
    coin.location.x = position.x - 25;
    coin.location.y = position.y - 25;
    coin.posZ = position.z;
    coin.toTopmost();
    return coin;
  }

  private getCreateCoinMenu(position: PointerCoordinate): ContextMenuAction {
    return {
      name: this.t('feature.tabletop.action.createCoin'),
      action: () => {
        const coin = this.createCoin(position);
        this.selectionSignalService.selectObject(coin.identifier, coin.aliasName);
        SoundEffect.play(PresetSound.dicePut);
      },
    };
  }

  private getCreateLightSourceMenu(position: PointerCoordinate): ContextMenuAction {
    return {
      name: this.t('feature.tabletop.action.createLight'),
      action: () => {
        const light = this.createLightSource(position);
        this.selectionSignalService.selectObject(light.identifier, light.aliasName);
        SoundEffect.play(PresetSound.cardPut);
      },
    };
  }

  private getCreateWhiteBoardMenu(position: PointerCoordinate): ContextMenuAction {
    return {
      name: this.t('feature.whiteBoard.action.create'),
      action: () => {
        const board = this.createWhiteBoard(position);
        this.selectionSignalService.selectObject(board.identifier, board.aliasName);
        SoundEffect.play(PresetSound.cardPut);
      },
    };
  }

  private getCreateRangeMenu(position: PointerCoordinate): ContextMenuAction {
    const subMenus: ContextMenuAction[] = [];

    getRangeMenuItems().forEach((item) => {
      subMenus.push({
        name: this.t(item.menuName),
        action: () => {
          this.createRangeArea(position, item.typeName);
          SoundEffect.play(PresetSound.dicePut);
        },
      });
    });
    return { name: this.t('feature.tabletop.action.createRange'), action: undefined, subActions: subMenus };
  }

  private getViewTable(): GameTable | null {
    return this.tableSelecter.viewTable;
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
