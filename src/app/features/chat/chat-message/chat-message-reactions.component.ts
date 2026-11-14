import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal } from '@angular/core';
import { ChatReactionService, ReactionTally } from '@axe/application/chat/chat-reaction.service';
import { StampRulesService } from '@axe/application/chat/stamp-rules.service';
import { LanguageService } from '@axe/application/i18n/language.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { StampComponent } from '@axe/ui/components/stamp/stamp.component';

/**
 * The stamps put on a chat line, each with how many put it on, pressed to add the reader's own or
 * take it back; nothing is drawn for a line with none.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'chat-message-reactions',
  templateUrl: './chat-message-reactions.component.html',
  host: { class: 'contents' },
  imports: [StampComponent],
})
export class ChatMessageReactionsComponent {
  private readonly objectChange = inject(ObjectChangeService);
  private readonly reactions = inject(ChatReactionService);
  private readonly stampRules = inject(StampRulesService);
  private readonly language = inject(LanguageService);

  /** The line the stamps are on. */
  readonly message = input.required<ChatMessage>();
  /**
   * Whether the reader may answer the line with stamps at all, by a guest as much as a player, since
   * it changes nothing on the table.
   */
  readonly mayAnswer = input(false);

  private readonly tallies = computed<readonly ReactionTally[]>(
    () => {
      const message = this.message();
      this.objectChange.versionOf(message.identifier)();
      if (!message.isShownInChat) return [];
      return this.reactions.talliesOf(message.identifier);
    },
    { equal: sameTallies }
  );

  /**
   * The stamps on the line, each with a number that goes up whenever more people put it on while the
   * line is in view, for it to make its move then and not every time the line is drawn again.
   */
  protected readonly chips = linkedSignal<
    readonly ReactionTally[],
    readonly (ReactionTally & { readonly play: number })[]
  >({
    source: this.tallies,
    computation: (tallies, previous) =>
      tallies.map((tally) => {
        const before = previous?.value.find((chip) => chip.stampId === tally.stampId);
        if (!before) return { ...tally, play: previous ? 1 : 0 };
        return { ...tally, play: tally.count > before.count ? before.play + 1 : before.play };
      }),
  });

  /**
   * Whether the reader may press a stamp on the line: to take back their own, always, and to add
   * theirs, where the room lets that stamp be put on.
   */
  protected canPress(tally: ReactionTally): boolean {
    if (!this.mayAnswer() || !this.reactions.mayReact) return false;
    return tally.mine || this.stampRules.allows('reaction', tally.stampId);
  }

  /** Who put a stamp on the line, as the reader's language lists names. */
  protected namesOf(tally: ReactionTally): string {
    const lang = this.language.currentLang();
    try {
      return new Intl.ListFormat(lang, { style: 'short', type: 'conjunction' }).format(tally.names);
    } catch {
      return tally.names.join(', ');
    }
  }

  /** Puts a stamp on the line for the reader, or takes it back off. */
  protected toggle(stampId: string): void {
    if (!this.mayAnswer()) return;
    this.reactions.toggle(this.message(), stampId);
  }
}

/** Whether two readings of a line's stamps say the same, so the line is not drawn again for nothing. */
function sameTallies(a: readonly ReactionTally[], b: readonly ReactionTally[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (tally, index) =>
        tally.stampId === b[index].stampId &&
        tally.count === b[index].count &&
        tally.mine === b[index].mine &&
        tally.names.join('\n') === b[index].names.join('\n')
    )
  );
}
