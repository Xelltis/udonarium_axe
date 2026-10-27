import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { chatDecorationClasses } from '@axe/domain/chat/chat-decoration';
import { RubyPart } from '@axe/ui/text-decoration/decorate-chat-text';

/**
 * A line cut into runs, with the reading written over the runs that have one and the chat's
 * decorations on the runs that carry them.
 *
 * Each run is bound as text, so a line can be shown part-way through without building html for it.
 */
@Component({
  selector: 'ruby-text',
  templateUrl: './ruby-text.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
})
export class RubyTextComponent {
  readonly parts = input.required<readonly RubyPart[]>();

  /** The classes a run is drawn with: none for a plain run. */
  protected classesOf(part: RubyPart): string {
    return part.decoration ? chatDecorationClasses(part.decoration) : '';
  }
}
