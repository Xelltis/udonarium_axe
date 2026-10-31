import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { chatColorHalo, chatDecorationClasses } from '@axe/domain/chat/chat-decoration';
import { StampComponent } from '@axe/ui/components/stamp/stamp.component';
import { RubyPart } from '@axe/ui/text-decoration/decorate-chat-text';

/**
 * A line cut into runs, with the reading written over the runs that have one, the chat's
 * decorations on the runs that carry them, and a stamp put inside the line drawn where it stands.
 *
 * Each run is bound as text, so a line can be shown part-way through without building html for it.
 */
@Component({
  selector: 'ruby-text',
  templateUrl: './ruby-text.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  imports: [StampComponent],
})
export class RubyTextComponent {
  readonly parts = input.required<readonly RubyPart[]>();
  /** How large a stamp put inside the line is drawn, in pixels. */
  readonly stampSize = input(28);

  /** The classes a run is drawn with: none for a plain run. */
  protected classesOf(part: RubyPart): string {
    return part.decoration ? chatDecorationClasses(part.decoration) : '';
  }

  /** The thin edge a run's colour is drawn with, where it is as light as white or as dark as black. */
  protected haloOf(part: RubyPart): string | null {
    return chatColorHalo(part.decoration?.color ?? null);
  }
}
