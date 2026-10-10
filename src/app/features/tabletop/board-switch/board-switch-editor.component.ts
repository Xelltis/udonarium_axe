import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { BoardSwitchService } from '@axe/application/tabletop/board-switch.service';
import { SwitchPressService } from '@axe/application/tabletop/switch-press.service';
import { BoardSwitch } from '@axe/domain/tabletop/board-switch/board-switch';
import { defaultSwitchDefinition, SwitchDefinition } from '@axe/domain/tabletop/board-switch/switch-definition';
import { SwitchDefinitionFieldsComponent } from '@axe/features/tabletop/board-switch/switch-definition-fields.component';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * Where the master writes what a switch is called and what it does.
 *
 * Every change is written to the switch as it is made, the way the other settings panels on the
 * table write theirs, so there is nothing to save and nothing lost by closing it. A seat that is
 * not the master's is shown nothing of what the switch does.
 */
@Component({
  selector: 'app-board-switch-editor',
  templateUrl: './board-switch-editor.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SwitchDefinitionFieldsComponent, TranslocoModule],
})
export class BoardSwitchEditorComponent {
  private readonly switches = inject(BoardSwitchService);
  private readonly presses = inject(SwitchPressService);
  private readonly objectChange = inject(ObjectChangeService);

  /** The switch being written, handed in by whoever opened the panel. */
  readonly target = signal<BoardSwitch | null>(null);

  protected readonly canEdit = this.switches.canEdit;

  /** Counts this panel's own writes, so what it draws follows them before the room has heard. */
  private readonly written = signal(0);

  protected readonly definition = computed<SwitchDefinition>(() => {
    const target = this.target();
    if (!target) return defaultSwitchDefinition();
    this.objectChange.versionOf(target.identifier)();
    this.written();
    return target.def;
  });

  protected readonly tried = signal<string>('');

  /** Tries the switch out from the panel without counting it as a press, and says how it went. */
  protected async tryIt(): Promise<void> {
    const target = this.target();
    if (!target) return;
    const outcome = await this.presses.press(target, { trial: true });
    this.tried.set(outcome);
  }

  /**
   * Writes one change onto what the switch says now.
   *
   * Read from the switch itself rather than from what the panel last drew: the room hears of a
   * change a moment after it is made, and two changes made inside that moment would otherwise each
   * be written over what the panel drew before either, the second taking the first back out.
   */
  protected update(change: Partial<SwitchDefinition>): void {
    const target = this.target();
    if (!target) return;
    this.switches.write(target, { ...target.def, ...change });
    this.written.update((count) => count + 1);
  }
}
