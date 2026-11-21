import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import {
  ACT_ROLES,
  type ActRole,
  modelMotionsOf,
  motionNameFor,
  type MotionRole,
  writeModelMotions,
} from '@axe/domain/tabletop/model-motions';
import {
  MODEL_FIELD_STYLES,
  type ModelledPiece,
  writeModelFields,
} from '@axe/ui/components/piece-model-fields/modelled-piece';
import { TranslocoModule } from '@jsverse/transloco';

/** A role as it is set here: the motion asked for by name, and the one the model plays for it now. */
interface RoleRow {
  readonly role: MotionRole;
  readonly asked: string;
  /** The motion the model plays for the role as things stand, or empty where it has none. */
  readonly plays: string;
}

/**
 * Where a piece or a block is given the motions its model plays: standing, and for a piece walking
 * and, in a fight, a blow, a spell, a blow taken and its going down, each by one of the model's own
 * motions or left to the model, which picks by their names. A role the model has no motion for is
 * played by moving the whole model, as a figure in the hand, unless that is turned off. Each can be
 * tried in the preview.
 */
@Component({
  selector: 'model-motion-fields',
  templateUrl: './model-motion-fields.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslocoModule],
  host: { class: 'flex flex-col gap-1.5' },
})
export class ModelMotionFieldsComponent {
  private readonly objectChange = inject(ObjectChangeService);

  /** The piece or block whose model's motions are set. */
  readonly target = input.required<ModelledPiece>();
  /** The motions its model has, by name. */
  readonly motions = input<readonly string[]>([]);
  /** Whether the model walks and fights, as a piece's does, or only stands, as a block's. */
  readonly fights = input(true);
  /** Asks for a role to be tried in the preview. */
  readonly tried = output<MotionRole>();

  protected readonly styles = MODEL_FIELD_STYLES;

  private readonly asked = computed(() => {
    const target = this.target();
    this.objectChange.versionOf(target.identifier)();
    return {
      idle: `${target.modelIdle ?? ''}`,
      walk: `${target.modelWalk ?? ''}`,
      ...modelMotionsOf(target.modelMotions),
    };
  });

  /** The roles in the order they are set, each with what is asked for it and what the model plays for it. */
  protected readonly rows = computed<RoleRow[]>(() => {
    const asked = this.asked();
    const names = this.motions();
    const roles: readonly MotionRole[] = this.fights() ? ['idle', 'walk', ...ACT_ROLES] : ['idle'];
    return roles.map((role) => ({
      role,
      asked: asked[role],
      plays: motionNameFor(role, names, asked[role]) ?? '',
    }));
  });

  /** Whether a role the model has no motion for is played by moving the whole model. */
  protected readonly made = computed(() => this.asked().made);

  /** Whether a role can be tried: the model has a motion for it, or is moved by hand through it. */
  protected canTry(row: RoleRow): boolean {
    return row.plays !== '' || (row.role !== 'idle' && this.made());
  }

  protected setMotion(role: MotionRole, name: string): void {
    const value = name.trim();
    if (role === 'idle') this.write({ modelIdle: value });
    else if (role === 'walk') this.write({ modelWalk: value });
    else this.writeFight({ [role]: value });
  }

  protected setMade(made: boolean): void {
    this.writeFight({ made });
  }

  private writeFight(changes: Partial<Record<ActRole, string>> & { made?: boolean }): void {
    const { idle: _idle, walk: _walk, ...fight } = this.asked();
    this.write({ modelMotions: writeModelMotions({ ...fight, ...changes }) });
  }

  private write(changes: Parameters<typeof writeModelFields>[1]): void {
    writeModelFields(this.target(), changes, this.objectChange);
  }
}
