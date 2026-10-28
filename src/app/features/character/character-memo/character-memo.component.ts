import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { GameCharacter } from '@axe/domain/character/game-character';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * Where the memo kept with a piece is written: what it carries, the flags its story has raised, and
 * whatever else the table wants to find on it again. Written as it is typed, like the sheet, and read
 * only by a seat that may not change the table.
 */
@Component({
  selector: 'app-character-memo',
  templateUrl: './character-memo.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslocoModule],
})
export class CharacterMemoComponent {
  private readonly objectChange = inject(ObjectChangeService);
  private readonly rolePermission = inject(RolePermissionService);

  /** The piece whose memo is written, handed in by whoever opened the panel. */
  readonly target = signal<GameCharacter | null>(null);

  protected readonly canEdit = computed(() => this.rolePermission.canEditTabletop());

  protected readonly memo = computed(() => {
    const target = this.target();
    if (!target) return '';
    this.objectChange.versionOf(target.identifier)();
    const note = target.innerNote;
    if (note) this.objectChange.versionOf(note.identifier)();
    return target.note;
  });

  /** Writes the memo as it is typed; nothing for a seat that may not change the table. */
  protected write(text: string): void {
    const target = this.target();
    if (!target || !this.canEdit()) return;
    target.note = text;
  }
}
