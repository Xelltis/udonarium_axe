import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement } from '@axe/domain/data/data-element';
import { DataSummarySetting } from '@axe/domain/data/data-summary-setting';
import { aliasTargetsOn, type ElementAlias, type ElementAliasTable } from '@axe/domain/data/element-alias';
import { RoomSettingsAccessService } from '@axe/features/room-settings/room-settings-access.service';
import { TranslocoModule } from '@jsverse/transloco';

/** An alias as its card shows it: the alias, and on how many pieces of the table it stands for an item. */
interface AliasRow {
  readonly alias: ElementAlias;
  readonly found: number;
}

function leavesOf(element: DataElement, into: DataElement[]): void {
  if (element.children.length < 1) {
    into.push(element);
    return;
  }
  for (const child of element.children) leavesOf(child, into);
}

/**
 * The room's aliases for sheet items: one name for a value the sheets of the room keep under
 * different names, with the references it may stand for in the order they are tried.
 *
 * A candidate is typed, or picked from the items the pieces on the table carry. Only the master
 * changes any of it; everyone else reads it.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'room-element-alias-settings',
  templateUrl: './room-element-alias-settings.component.html',
  host: { class: 'contents' },
  imports: [TranslocoModule],
})
export class RoomElementAliasSettingsComponent {
  private readonly access = inject(RoomSettingsAccessService);
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);

  readonly isSharedReadOnly = this.access.isSharedReadOnly;

  /** The pieces on the table, whose sheets the candidates are picked from and counted on. */
  private readonly tablePieces = computed<GameCharacter[]>(() => {
    this.objectChange.collectionOf(GameCharacter.aliasName)();
    this.objectChange.collectionOf('data')();
    return this.objectStore.getObjects(GameCharacter).filter((character) => {
      this.objectChange.versionOf(character.identifier)();
      return character.location.name === 'table';
    });
  });

  /** How many pieces are on the table, which a count of pieces an alias is found on is read against. */
  readonly pieceCount = computed(() => this.tablePieces().length);

  /** The room's aliases, each with the number of pieces on the table it stands for an item on. */
  readonly rows = computed<AliasRow[]>(() => {
    this.objectChange.versionOf(DataSummarySetting.instance.identifier)();
    const pieces = this.tablePieces();
    return DataSummarySetting.instance.aliases.map((alias) => ({
      alias,
      found: pieces.filter((piece) => {
        const root = piece.rootDataElement;
        return root !== null && aliasTargetsOn(root, alias).length > 0;
      }).length,
    }));
  });

  /**
   * The references a candidate can be picked from: the path of every item the sheets of the pieces
   * on the table carry, each once, in the order the sheets list them.
   */
  readonly referenceChoices = computed<string[]>(() => {
    const paths: string[] = [];
    const seen = new Set<string>();
    for (const piece of this.tablePieces()) {
      const detail = piece.detailDataElement;
      if (!detail) continue;
      const leaves: DataElement[] = [];
      for (const child of detail.children) leavesOf(child, leaves);
      for (const leaf of leaves) {
        if (leaf.name.trim().length < 1) continue;
        const path = DataElement.formatReferencePath(leaf, detail);
        if (seen.has(path)) continue;
        seen.add(path);
        paths.push(path);
      }
    }
    return paths;
  });

  /** Adds an alias under the name typed, and empties the box; a blank name or one already taken adds nothing. */
  addAlias(box: HTMLInputElement): void {
    const name = box.value.trim();
    const aliases = this.aliases();
    if (this.isSharedReadOnly() || name.length < 1 || aliases.some((alias) => alias.name === name)) return;
    this.write([...aliases, { name, candidates: [] }]);
    box.value = '';
  }

  /**
   * Gives an alias the name typed. A blank name or one another alias has is turned away, and the
   * box goes back to the name the alias keeps.
   */
  renameAlias(at: number, box: HTMLInputElement): void {
    const aliases = this.aliases();
    const alias = aliases[at];
    if (!alias) return;
    const name = box.value.trim();
    const taken = aliases.some((other, index) => index !== at && other.name === name);
    if (this.isSharedReadOnly() || name.length < 1 || taken) {
      box.value = alias.name;
      return;
    }
    if (name !== alias.name) this.write(aliases.map((other, index) => (index === at ? { ...other, name } : other)));
  }

  /** Takes an alias away, after which its name is read as any other name is. */
  removeAlias(at: number): void {
    if (this.isSharedReadOnly()) return;
    this.write(this.aliases().filter((_, index) => index !== at));
  }

  /** Adds the reference typed or picked to the end of an alias's candidates, and empties the box. */
  addCandidate(at: number, box: HTMLInputElement): void {
    const reference = box.value.trim();
    const alias = this.aliases()[at];
    if (this.isSharedReadOnly() || !alias || reference.length < 1 || alias.candidates.includes(reference)) return;
    this.setCandidates(at, [...alias.candidates, reference]);
    box.value = '';
  }

  /** Takes a candidate out of an alias. */
  removeCandidate(at: number, candidateAt: number): void {
    const alias = this.aliases()[at];
    if (this.isSharedReadOnly() || !alias) return;
    this.setCandidates(
      at,
      alias.candidates.filter((_, index) => index !== candidateAt)
    );
  }

  /** Moves a candidate one place earlier or later in the order it is tried in. */
  moveCandidate(at: number, candidateAt: number, by: -1 | 1): void {
    const alias = this.aliases()[at];
    const to = candidateAt + by;
    if (this.isSharedReadOnly() || !alias || to < 0 || to >= alias.candidates.length) return;
    const candidates = [...alias.candidates];
    [candidates[candidateAt], candidates[to]] = [candidates[to], candidates[candidateAt]];
    this.setCandidates(at, candidates);
  }

  private aliases(): ElementAliasTable {
    return DataSummarySetting.instance.aliases;
  }

  private setCandidates(at: number, candidates: readonly string[]): void {
    this.write(this.aliases().map((alias, index) => (index === at ? { ...alias, candidates } : alias)));
  }

  private write(aliases: ElementAliasTable): void {
    DataSummarySetting.instance.aliases = aliases;
  }
}
