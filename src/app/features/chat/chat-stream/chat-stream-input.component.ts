import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { ChatSpeakerService } from '@axe/application/chat/chat-speaker.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { chatBubbleOf, chatColorOf } from '@axe/domain/chat/chat-color';
import { type ChatOutgoing, composeChatOutgoing } from '@axe/domain/chat/chat-outgoing';
import { DiceBot } from '@axe/domain/dice/dice-bot';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { canRoleEdit } from '@axe/domain/peer/peer-role';
import { allowsChat } from '@axe/features/chat/chat-input/chat-input-helpers';
import { ComposingMarkDirective } from '@axe/ui/directives/composing-mark.directive';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { TranslocoModule } from '@jsverse/transloco';

/** Someone a line can be spoken as here, with the picture shown beside the choice. */
interface StreamSpeaker {
  identifier: string;
  name: string;
  image: string;
}

/**
 * The input of the stream chat widget: who is speaking, with their picture, over one box to write
 * in and a button to send.
 *
 * The chat window's input carries a portrait, colours, a whisper, a dice bot and a toolbar, which a
 * window this narrow cannot lay out. A line written here is sent as the chat window sends one, in
 * the speaker's first colour, under the dice bot the chat window has chosen; who it is spoken as
 * starts as the chat window's speaker, and choosing someone else here leaves the chat window as it
 * was. Enter sends and Shift+Enter starts a new line, but not while a word is being made with an
 * input method.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'chat-stream-input',
  templateUrl: './chat-stream-input.component.html',
  host: { class: 'block' },
  imports: [ComposingMarkDirective, FormsModule, SafePipe, TranslocoModule],
})
export class ChatStreamInputComponent {
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly chatMessageService = inject(ChatMessageService);
  private readonly vision = inject(VisionService);
  private readonly t = inject(TRANSLATE_FN);

  /** Whether the reader may speak in the tab the widget shows. */
  readonly canSpeak = input(true);
  /** A line to send, put together as the chat window's input puts one together. */
  readonly said = output<ChatOutgoing>();

  readonly sendFrom = signal(inject(ChatSpeakerService).identifier() || (PeerCursor.myCursor?.identifier ?? ''));
  readonly text = signal('');

  /**
   * This seat itself, then the characters it may speak as, as the chat window lists them: a piece
   * on the table it cannot see is left out, but for the one already chosen.
   */
  readonly speakers = computed<StreamSpeaker[]>(() => {
    this.objectChange.trackMyCursor();
    this.objectChange.collectionOf(GameCharacter.aliasName)();
    const me = PeerCursor.myCursor;
    const chosen = this.sendFrom();
    const characters = this.objectStore.getObjects<GameCharacter>(GameCharacter).filter((character) => {
      this.objectChange.versionOf(character.identifier)();
      return (
        allowsChat(character, me?.peerId ?? '', false) &&
        (character.identifier === chosen || this.vision.mayBeListed(character))
      );
    });
    const self: StreamSpeaker[] = me
      ? [
          {
            identifier: me.identifier,
            name: `${me.name}${this.t('feature.chat.input.you')}`,
            image: me.image?.url ?? '',
          },
        ]
      : [];
    return [
      ...self,
      ...characters.map((character) => ({
        identifier: character.identifier,
        name: character.name,
        image: character.imageFile.url,
      })),
    ];
  });

  /** Who the next line goes out as: the one chosen while they can still be spoken as, else this seat. */
  readonly speaker = computed<StreamSpeaker | null>(() => {
    const speakers = this.speakers();
    return speakers.find((speaker) => speaker.identifier === this.sendFrom()) ?? speakers[0] ?? null;
  });

  readonly sendable = computed(() => this.canSpeak() && this.text().trim().length > 0 && this.speaker() !== null);

  /** Enter sends the line; Shift+Enter, and a key that ends a word being made, leave it to the box. */
  onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    this.send();
  }

  /** Puts the line together, clears the box, and hands the line on once its dice bot is known. */
  send(): void {
    if (!this.sendable()) return;
    const text = this.text();
    const sendFrom = this.speaker()!.identifier;
    const object = this.objectStore.get(sendFrom);
    const character = object instanceof GameCharacter ? object : null;
    // A guest's lines go in the guest's own colours, as in the chat window.
    const colors = character && canRoleEdit(PeerCursor.myRole) ? character : PeerCursor.myCursor;
    const draft = {
      text,
      sendFrom,
      sendTo: '',
      portraitIndex: character?.selectedPortraitIndex ?? 0,
      color: chatColorOf(colors, 0),
      bubbles: chatBubbleOf(colors, 0),
      replyTo: '',
      quoteOf: '',
      toTicker: false,
    };
    this.text.set('');
    DiceBot.gameSystemForLineAsync(this.gameType(), text).then((gameSystem) => {
      this.said.emit(composeChatOutgoing({ ...draft, gameSystem }));
    });
  }

  /** The dice bot the chat window has chosen, or the room's where it has chosen none. */
  private gameType(): string {
    return this.chatMessageService.gameType || this.objectStore.get<Config>('Config')?.defaultDiceBot || 'DiceBot';
  }
}
