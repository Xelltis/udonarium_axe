import type Anthropic from '@anthropic-ai/sdk';
import { APIUserAbortError } from '@anthropic-ai/sdk';

import type { GmApi } from './game-master';

/**
 * A response the stand-in gives: the message, a failure to throw (with the response as far as it came),
 * or one that never comes until given up.
 */
export type FakeReply =
  Anthropic.Message | Error | { readonly fail: Error; readonly partial: Anthropic.Message } | 'hang';

/** Usage as a response reports it, with whatever the spec sets. */
export function usage(set: Partial<Anthropic.Usage> = {}): Anthropic.Usage {
  return {
    input_tokens: 100,
    output_tokens: 50,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_creation: null,
    ...set,
  } as Anthropic.Usage;
}

/** A response of the model, ending as told. */
export function reply(
  content: readonly Record<string, unknown>[],
  stop: Anthropic.StopReason = 'end_turn',
  used: Partial<Anthropic.Usage> = {}
): Anthropic.Message {
  return {
    id: 'msg',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    content,
    stop_reason: stop,
    stop_sequence: null,
    usage: usage(used),
  } as unknown as Anthropic.Message;
}

/** A call of a tool, as the model writes one. */
export function toolUse(id: string, name: string, input: Record<string, unknown>): Record<string, unknown> {
  return { type: 'tool_use', id, name, input };
}

/** A stand-in for the Claude API: it answers each request with the next reply given and keeps what it was sent. */
export class FakeApi implements GmApi {
  readonly sent: Anthropic.MessageStreamParams[] = [];
  readonly replies: FakeReply[] = [];

  stream(body: Anthropic.MessageStreamParams, options: { readonly signal: AbortSignal }) {
    // What was sent, as it stood then: the conversation grows after it is sent.
    this.sent.push(JSON.parse(JSON.stringify(body)) as Anthropic.MessageStreamParams);
    const next = this.replies.shift() ?? new Error('No reply was given for this request.');
    return {
      currentMessage: typeof next === 'object' && 'fail' in next ? next.partial : undefined,
      finalMessage: () =>
        new Promise<Anthropic.Message>((resolve, reject) => {
          if (next === 'hang') {
            options.signal.addEventListener('abort', () => reject(new APIUserAbortError()), { once: true });
            return;
          }
          if (next instanceof Error) reject(next);
          else if ('fail' in next) reject(next.fail);
          else resolve(next);
        }),
    };
  }
}
