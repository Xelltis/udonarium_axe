import { computed, DestroyRef, inject, Injectable, Signal } from '@angular/core';
import { CoordinateService } from '@axe/application/input/coordinate.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopDisplayPreferenceService } from '@axe/application/ui/tabletop-display-preference.service';
import { ViewModePreferenceService } from '@axe/application/ui/view-mode-preference.service';
import { ObjectSerializer } from '@axe/core/sync/object-serializer';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Card } from '@axe/domain/card/card';
import { CardStack } from '@axe/domain/card/card-stack';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { Coin } from '@axe/domain/coin/coin';
import { DiceSymbol } from '@axe/domain/dice/dice-symbol';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { GameTableMask } from '@axe/domain/tabletop/game-table-mask';
import { GameTableScratchMask } from '@axe/domain/tabletop/game-table-scratch-mask';
import { LightSource } from '@axe/domain/tabletop/light-source';
import { clearOwnershipTree } from '@axe/domain/tabletop/ownership';
import { RangeArea } from '@axe/domain/tabletop/range';
import { TableAmbience } from '@axe/domain/tabletop/table-ambience';
import { lightSourcesOn } from '@axe/domain/tabletop/table-lights';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { resolveTabletopDisplay, TabletopDisplaySettings } from '@axe/domain/tabletop/tabletop-display';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { TextNote } from '@axe/domain/tabletop/text-note';
import { WhiteBoard } from '@axe/domain/tabletop/white-board';
import { laysFlat } from '@axe/domain/ui/view-mode';
/** What a table carries with it, so that looking at another table brings its own along. */
const TABLE_CHILD_ALIASES = [
  GameTableMask.aliasName,
  GameTableScratchMask.aliasName,
  Terrain.aliasName,
  TableAmbience.aliasName,
  LightSource.aliasName,
  WhiteBoard.aliasName,
];

type ObjectIdentifier = string;
type LocationName = string;

@Injectable()
export class TabletopService {
  private readonly coordinateService = inject(CoordinateService);
  private readonly objectStore = inject(ObjectStore);
  private readonly objectSerializer = inject(ObjectSerializer);
  private readonly chatTabList = inject(ChatTabList);
  readonly tableSelecter = inject(TableSelecter);
  private readonly viewMode = inject(ViewModePreferenceService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly seatDisplay = inject(TabletopDisplayPreferenceService);
  private readonly destroyRef = inject(DestroyRef);

  private _emptyTable: GameTable = new GameTable('');
  get currentTable(): GameTable {
    const table = this.tableSelecter.viewTable;
    return table ? table : this._emptyTable;
  }

  /**
   * Read the version, then hand back the table.
   *
   * It hands back the same table every time, so under the default equality a new version never reaches anything downstream.
   * Grid size and weather both have to show the moment they change, so this always counts as changed.
   */
  readonly currentTableVersion = computed(
    () => {
      this.objectChange.versionOf(this.tableSelecter.identifier)();
      const table = this.currentTable;
      this.objectChange.versionOf(table.identifier)();
      return table;
    },
    { equal: () => false }
  );

  /** The view the table is best read in, which a reader following the table is given. */
  readonly recommendsFlat: Signal<boolean> = computed(() => this.currentTableVersion().mode2d);
  /** What this seat asked for, which is 'auto' until a reader takes the choice from the table. */
  readonly seatViewMode = this.viewMode.mode;
  readonly mode2d: Signal<boolean> = computed(() => laysFlat(this.seatViewMode(), this.recommendsFlat()));
  /**
   * How the flat table is drawn and reached, feature by feature.
   *
   * The screen in front of this reader decides, falling back to the table for whatever it has
   * never been told.
   */
  readonly display: Signal<TabletopDisplaySettings> = computed(() =>
    resolveTabletopDisplay(this.currentTableVersion(), this.seatDisplay.own())
  );
  /** Perspective is only ever dropped for a table being looked straight down on. */
  readonly orthographicProjection: Signal<boolean> = computed(
    () => this.mode2d() && this.display().orthographicProjection
  );
  readonly imageBillboard: Signal<boolean> = computed(() => this.currentTableVersion().imageBillboard);
  /** How wide one square is meant to measure on the glass. */
  readonly cellMm: Signal<number> = computed(() => this.display().cellMm);
  readonly gridSize: Signal<number> = computed(() => this.currentTableVersion().gridSize);

  private locationMap: Map<ObjectIdentifier, LocationName> = new Map();
  private surfaceMap: Map<ObjectIdentifier, string> = new Map();
  private parentMap: Map<ObjectIdentifier, ObjectIdentifier> = new Map();
  private characterCache = new TabletopCache<GameCharacter>(() =>
    this.objectStore.getObjects(GameCharacter).filter((obj) => obj.isVisibleOnTable)
  );
  private cardCache = new TabletopCache<Card>(() =>
    this.objectStore.getObjects(Card).filter((obj) => obj.isVisibleOnTable)
  );
  private cardStackCache = new TabletopCache<CardStack>(() =>
    this.objectStore.getObjects(CardStack).filter((obj) => obj.isVisibleOnTable)
  );
  private tableMaskCache = new TabletopCache<GameTableMask>(() => {
    const viewTable = this.tableSelecter.viewTable;
    return viewTable ? viewTable.masks : [];
  });
  private tableScratchMaskCache = new TabletopCache<GameTableScratchMask>(() => {
    const viewTable = this.tableSelecter.viewTable;
    return viewTable ? viewTable.scratchMasks : [];
  });
  private rangeCache = new TabletopCache<RangeArea>(() =>
    this.objectStore.getObjects(RangeArea).filter((obj) => obj.isVisibleOnTable)
  );
  private lightSourceCache = new TabletopCache<LightSource>(() => lightSourcesOn(this.tableSelecter.viewTable));
  private whiteBoardCache = new TabletopCache<WhiteBoard>(() => {
    const viewTable = this.tableSelecter.viewTable;
    return viewTable ? viewTable.whiteBoards : [];
  });
  private terrainCache = new TabletopCache<Terrain>(() => {
    const viewTable = this.tableSelecter.viewTable;
    return viewTable ? viewTable.terrains : [];
  });
  private ambienceCache = new TabletopCache<TableAmbience>(() => {
    const viewTable = this.tableSelecter.viewTable;
    return viewTable ? viewTable.ambiences : [];
  });
  private textNoteCache = new TabletopCache<TextNote>(() => this.objectStore.getObjects(TextNote));
  private coinCache = new TabletopCache<Coin>(() =>
    this.objectStore.getObjects(Coin).filter((obj) => obj.isVisibleOnTable)
  );
  private diceSymbolCache = new TabletopCache<DiceSymbol>(() => this.objectStore.getObjects(DiceSymbol));

  get characters(): GameCharacter[] {
    return this.characterCache.objects;
  }
  get cards(): Card[] {
    return this.cardCache.objects;
  }
  get cardStacks(): CardStack[] {
    return this.cardStackCache.objects;
  }
  get tableMasks(): GameTableMask[] {
    return this.tableMaskCache.objects;
  }
  get tableScratchMasks(): GameTableScratchMask[] {
    return this.tableScratchMaskCache.objects;
  }
  get ranges(): RangeArea[] {
    return this.rangeCache.objects;
  }
  get lightSources(): LightSource[] {
    return this.lightSourceCache.objects;
  }
  get whiteBoards(): WhiteBoard[] {
    return this.whiteBoardCache.objects;
  }
  get terrains(): Terrain[] {
    return this.terrainCache.objects;
  }
  get ambiences(): TableAmbience[] {
    return this.ambienceCache.objects;
  }
  get textNotes(): TextNote[] {
    return this.textNoteCache.objects;
  }
  get diceSymbols(): DiceSymbol[] {
    return this.diceSymbolCache.objects;
  }
  get coins(): Coin[] {
    return this.coinCache.objects;
  }
  get peerCursors(): PeerCursor[] {
    return this.objectStore.getObjects<PeerCursor>(PeerCursor);
  }

  constructor() {
    this.initialize();
  }

  private initialize() {
    this.refreshCacheAll();
    this.objectChange.objectAdded$.subscribe((e) => {
      this.refreshCache(e.aliasName);
    }, this.destroyRef);
    this.objectChange.objectChanged$.subscribe((event) => {
      if (event.identifier === this.currentTable.identifier || event.identifier === this.tableSelecter.identifier) {
        for (const aliasName of TABLE_CHILD_ALIASES) {
          this.refreshCache(aliasName);
          this.objectChange.notifyCollectionChanged(aliasName);
        }
        return;
      }

      const object = this.objectStore.get(event.identifier);
      if (!object || !(object instanceof TabletopObject)) {
        this.refreshCache(event.aliasName);
        this.objectChange.notifyCollectionChanged(event.aliasName);
      } else if (this.shouldRefreshCache(object)) {
        this.refreshCache(event.aliasName);
        this.updateMap(object);
        this.objectChange.notifyCollectionChanged(event.aliasName);
      }
    }, this.destroyRef);
    this.objectChange.objectDeleted$.subscribe((event) => {
      const aliasName = event.aliasName;
      if (!aliasName) {
        this.refreshCacheAll();
      } else {
        this.refreshCache(aliasName);
      }
    }, this.destroyRef);
    this.objectChange.objectRemoved$.subscribe((e) => {
      const aliasName = e.aliasName;
      if (!aliasName) {
        this.refreshCacheAll();
      } else {
        this.refreshCache(aliasName);
      }
    }, this.destroyRef);
    this.objectChange.xmlLoaded$.subscribe((event) => {
      const xmlElement: Element = event.xmlElement;

      const gameObject = this.objectSerializer.parseXml(xmlElement);

      if (gameObject instanceof TabletopObject) {
        const dropTarget = event.dropPoint
          ? ((document.elementFromPoint(event.dropPoint.x, event.dropPoint.y) as HTMLElement) ?? undefined)
          : undefined;
        const pointer = dropTarget
          ? this.coordinateService.calcTabletopLocalCoordinate(
              { x: event.dropPoint!.x, y: event.dropPoint!.y, z: 0 },
              dropTarget
            )
          : this.coordinateService.calcTabletopLocalCoordinate();
        gameObject.location.x = pointer.x - 25;
        gameObject.location.y = pointer.y - 25;
        gameObject.posZ = pointer.z;
        clearOwnershipTree(gameObject);
        this.placeToTabletop(gameObject);
        SoundEffect.play(PresetSound.piecePut);
      } else if (gameObject instanceof ChatTab) {
        this.chatTabList.addChatTab(gameObject);
      }

      //adds what a dropped room archive is missing
      const objects: TabletopObject[] = this.objectStore.getObjects(GameCharacter);
      for (const gameObject of objects) {
        if (gameObject instanceof GameCharacter) {
          const gameCharacter: GameCharacter = gameObject;
          gameCharacter.addExtendData();
        }
      }
    }, this.destroyRef);
  }

  private findCache(aliasName: string): TabletopCache<TabletopObject> | null {
    switch (aliasName) {
      case GameCharacter.aliasName:
        return this.characterCache;
      case Card.aliasName:
        return this.cardCache;
      case CardStack.aliasName:
        return this.cardStackCache;
      case GameTableMask.aliasName:
        return this.tableMaskCache;
      case GameTableScratchMask.aliasName:
        return this.tableScratchMaskCache;
      case RangeArea.aliasName:
        return this.rangeCache;
      case LightSource.aliasName:
        return this.lightSourceCache;
      case WhiteBoard.aliasName:
        return this.whiteBoardCache;
      case Terrain.aliasName:
        return this.terrainCache;
      case TableAmbience.aliasName:
        return this.ambienceCache;
      case TextNote.aliasName:
        return this.textNoteCache;
      case DiceSymbol.aliasName:
        return this.diceSymbolCache;
      case Coin.aliasName:
        return this.coinCache;
      default:
        return null;
    }
  }

  private refreshCache(aliasName: string) {
    const cache = this.findCache(aliasName);
    if (cache) cache.refresh();
  }

  private refreshCacheAll() {
    this.characterCache.refresh();
    this.cardCache.refresh();
    this.cardStackCache.refresh();
    this.tableMaskCache.refresh();
    this.tableScratchMaskCache.refresh();
    this.rangeCache.refresh();
    this.lightSourceCache.refresh();
    this.whiteBoardCache.refresh();
    this.terrainCache.refresh();
    this.ambienceCache.refresh();
    this.textNoteCache.refresh();
    this.diceSymbolCache.refresh();
    this.coinCache.refresh();
    this.clearMap();
  }

  private shouldRefreshCache(object: TabletopObject): boolean {
    return (
      this.locationMap.get(object.identifier) !== object.location.name ||
      this.surfaceMap.get(object.identifier) !== (object.location.surface ?? 'floor') ||
      this.parentMap.get(object.identifier) !== object.parentId
    );
  }

  private updateMap(object: TabletopObject) {
    this.locationMap.set(object.identifier, object.location.name);
    this.surfaceMap.set(object.identifier, object.location.surface ?? 'floor');
    this.parentMap.set(object.identifier, object.parentId);
  }

  private clearMap() {
    this.locationMap.clear();
    this.surfaceMap.clear();
    this.parentMap.clear();
  }

  private placeToTabletop(gameObject: TabletopObject) {
    switch (gameObject.aliasName) {
      case GameTableMask.aliasName:
        if (gameObject instanceof GameTableMask) gameObject.isLock = false;
      // falls through
      case Terrain.aliasName:
        if (gameObject instanceof Terrain) gameObject.isLocked = false;
      // falls through
      case LightSource.aliasName:
        if (gameObject instanceof LightSource) gameObject.isLock = false;
      // falls through
      case TableAmbience.aliasName:
        if (gameObject instanceof TableAmbience) gameObject.isLock = false;
        if (!this.tableSelecter || !this.tableSelecter.viewTable) return;
        this.tableSelecter.viewTable.appendChild(gameObject);
        break;
      default:
        gameObject.setLocation('table');
        break;
    }
  }
}

class TabletopCache<T extends TabletopObject> {
  private needsRefresh: boolean = true;

  private _objects: T[] = [];
  get objects(): T[] {
    if (this.needsRefresh) {
      this._objects = this.refreshCollector();
      this._objects = this._objects ? this._objects : [];
      this.needsRefresh = false;
    }
    return this._objects;
  }

  constructor(readonly refreshCollector: () => T[]) {}

  refresh() {
    this.needsRefresh = true;
  }
}
