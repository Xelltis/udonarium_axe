import { Injectable, signal } from '@angular/core';
import { ChatQuoteRequest, ChatReplyRequest } from '@axe/application/ui/ui-signal.service';

/**
 * The line one chat panel's input has been asked to answer, kept by that panel alone.
 *
 * Answering a line is a thing said to one input: the reader pressed reply on a line in the
 * panel they are reading, and what they meant was the box under it. Asked of the room instead,
 * every chat panel open would hear it, every one of them would take the line in, and the last
 * to be drawn would pull the caret over to itself - which is the one panel the reader was not
 * looking at.
 *
 * Provided by each panel that has an input of its own, so a panel hears only what was said to
 * it. A line read somewhere with no input to answer in - the stream - still asks the room, and
 * whatever input is out there takes it.
 */
@Injectable()
export class ChatComposeService {
  private readonly reply = signal<ChatReplyRequest | null>(null);
  private readonly quote = signal<ChatQuoteRequest | null>(null);

  /** The line this panel's input is answering, or nothing where it is answering none. */
  readonly replyRequest = this.reply.asReadonly();
  /** The line this panel's input is quoting, or nothing where it is quoting none. */
  readonly quoteRequest = this.quote.asReadonly();

  /** Makes a line the one this panel's input answers, and puts the caret in it. */
  requestReply(messageIdentifier: string): void {
    this.reply.set({ messageIdentifier, timestamp: Date.now() });
  }

  /** Drops the line this panel's input was answering. */
  clearReply(): void {
    this.reply.set(null);
  }

  /** Makes a line the one this panel's input quotes, and puts the caret in it. */
  requestQuote(messageIdentifier: string): void {
    this.quote.set({ messageIdentifier, timestamp: Date.now() });
  }

  /** Drops the line this panel's input was quoting. */
  clearQuote(): void {
    this.quote.set(null);
  }
}
