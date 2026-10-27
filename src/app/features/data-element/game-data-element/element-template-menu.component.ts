import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';
import { DataElement } from '@axe/domain/data/data-element';
import { TextTooltipDirective } from '@axe/ui/directives/text-tooltip.directive';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * The menu of the templates a sheet keeps, opened beside a group or section heading: each put in by
 * choosing it, or deleted without being put in.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'element-template-menu',
  templateUrl: './element-template-menu.component.html',
  host: { class: 'contents' },
  imports: [TextTooltipDirective, TranslocoModule],
})
export class ElementTemplateMenuComponent {
  /** The templates on offer. */
  readonly templates = input.required<readonly DataElement[]>();

  /** Whether the menu is open. */
  readonly open = model(false);

  /** A template chosen to be put in. */
  readonly insert = output<DataElement>();

  /** A template chosen to be deleted. */
  readonly remove = output<DataElement>();

  /** Asks for a template to be deleted, without the press reaching the template it sits beside. */
  protected removeTemplate(template: DataElement, event: Event): void {
    event.stopPropagation();
    this.remove.emit(template);
  }
}
