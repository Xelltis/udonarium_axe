import { inject, Injectable } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { CardStack } from '@axe/domain/card/card-stack';
import { GameCharacter } from '@axe/domain/character/game-character';
import { Coin } from '@axe/domain/coin/coin';
import { DiceSymbol } from '@axe/domain/dice/dice-symbol';
import { findByReference } from '@axe/domain/hotbar/hotbar-reference';
import { BoardStash, CONCEALED_LOCATION, stashOf } from '@axe/domain/tabletop/board-switch/concealment';
import { SwitchTargetRef } from '@axe/domain/tabletop/board-switch/switch-definition';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { GameTableMask } from '@axe/domain/tabletop/game-table-mask';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { TextNote } from '@axe/domain/tabletop/text-note';

/** The kinds of thing that stand on a table by where they are, rather than by hanging under it. */
const PLACED_KINDS = [GameCharacter, TextNote, DiceSymbol, Coin, CardStack] as const;

/**
 * Puts things on the table out of sight, and brings them back, for switches and for the master.
 *
 * A block or a cover hangs under its table and goes into the table's stash; a piece, a note, a die,
 * a coin or a deck stands where it stands and is moved to the concealed place. Either way it keeps
 * where it was, so bringing it back sets it down exactly where the master left it.
 */
@Injectable({ providedIn: 'root' })
export class ConcealmentService {
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly tableSelecter = inject(TableSelecter);

  /** What stands on the table being looked at and could be put out of sight. */
  concealable(): TabletopObject[] {
    this.track();
    const table = this.tableSelecter.viewTable;
    const hanging: TabletopObject[] = table ? [...table.terrains, ...table.masks] : [];
    return [...hanging, ...this.placed().filter((object) => object.location.name === 'table')];
  }

  /** Everything the master has put out of sight, on every table. */
  concealed(): TabletopObject[] {
    this.track();
    const stashed: TabletopObject[] = [];
    for (const table of this.objectStore.getObjects<GameTable>(GameTable)) {
      const stash = stashOf(table);
      if (!stash) continue;
      this.objectChange.versionOf(stash.identifier)();
      for (const child of stash.children) if (child instanceof TabletopObject) stashed.push(child);
    }
    return [...stashed, ...this.placed().filter((object) => object.location.name === CONCEALED_LOCATION)];
  }

  /** Whether something is out of sight just now. */
  isConcealed(object: TabletopObject): boolean {
    return object.parent instanceof BoardStash || object.location.name === CONCEALED_LOCATION;
  }

  /** The thing a switch names, among the things given. */
  find(ref: SwitchTargetRef, among: readonly TabletopObject[]): TabletopObject | null {
    if (ref.identifier.length < 1 && ref.name.trim().length < 1) return null;
    return findByReference(among, ref.identifier, ref.name.trim())?.thing ?? null;
  }

  /** Puts something out of sight, answering whether it went. */
  conceal(object: TabletopObject): boolean {
    if (this.isConcealed(object)) return false;
    const table = object.parent;
    if ((object instanceof Terrain || object instanceof GameTableMask) && table instanceof GameTable) {
      const stash = stashOf(table) ?? this.makeStash(table);
      stash.appendChild(object);
      return true;
    }
    if (object.location.name !== 'table') return false;
    object.setLocation(CONCEALED_LOCATION);
    return true;
  }

  /** Brings something back to where it was put out of sight, answering whether it came. */
  reveal(object: TabletopObject): boolean {
    const stash = object.parent;
    if (stash instanceof BoardStash) {
      const table = stash.parent;
      if (!(table instanceof GameTable)) return false;
      table.appendChild(object);
      return true;
    }
    if (object.location.name !== CONCEALED_LOCATION) return false;
    object.setLocation('table');
    return true;
  }

  private makeStash(table: GameTable): BoardStash {
    const stash = new BoardStash();
    stash.initialize();
    table.appendChild(stash);
    return stash;
  }

  /**
   * Everything that stands where it stands, each followed: being put out of sight or brought back
   * moves a thing rather than adding or removing it, so a list built from these hears it only
   * from the thing itself.
   */
  private placed(): TabletopObject[] {
    const placed = PLACED_KINDS.flatMap((kind) => this.objectStore.getObjects<TabletopObject>(kind));
    for (const object of placed) this.objectChange.versionOf(object.identifier)();
    return placed;
  }

  private track(): void {
    for (const kind of PLACED_KINDS) this.objectChange.collectionOf(kind.aliasName)();
    this.objectChange.collectionOf(Terrain.aliasName)();
    this.objectChange.collectionOf(GameTableMask.aliasName)();
    const table = this.tableSelecter.viewTable;
    if (table) this.objectChange.versionOf(table.identifier)();
  }
}
