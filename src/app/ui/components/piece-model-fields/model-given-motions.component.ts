import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ModelMotionFilesService } from '@axe/application/tabletop/model-motion-files.service';
import { MODEL_FIELD_STYLES } from '@axe/ui/components/piece-model-fields/modelled-piece';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * The motions for VRM models (`.vrma`) a VRM is given, which it plays as motions of its own for every
 * piece drawn as it: each named, to be taken back, and those held here it may yet be given, to choose
 * from. A seat that may not change the table sees them only.
 */
@Component({
  selector: 'model-given-motions',
  templateUrl: './model-given-motions.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslocoModule],
  host: { class: 'flex flex-col gap-1' },
})
export class ModelGivenMotionsComponent {
  private readonly motionFiles = inject(ModelMotionFilesService);

  /** The identifier of the VRM the motions are given to. */
  readonly modelIdentifier = input.required<string>();

  protected readonly styles = MODEL_FIELD_STYLES;

  protected readonly given = computed(() => this.motionFiles.givenTo(this.modelIdentifier()));
  protected readonly givable = computed(() => this.motionFiles.givable(this.modelIdentifier()));
  protected readonly canGive = computed(() => this.motionFiles.canGive());

  protected give(identifier: string): void {
    if (identifier) this.motionFiles.give(this.modelIdentifier(), identifier);
  }

  protected takeBack(identifier: string): void {
    this.motionFiles.takeBack(this.modelIdentifier(), identifier);
  }
}
