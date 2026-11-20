import Anthropic, {
  APIError,
  APIUserAbortError,
  AuthenticationError,
  BadRequestError,
  PermissionDeniedError,
} from '@anthropic-ai/sdk';
import {
  GM_GUIDE,
  GM_NOTES_TOOL,
  GM_NOTES_TOOL_NAME,
  GM_SET_ASIDE_PROMPT,
  GM_TABLE_TOOLS,
  gmBriefing,
  gmOpeningPrompt,
  gmTurnPrompt,
} from '@axe/core/agent/agent-gm';
import type { GmSettings, GmWake } from '@axe/core/agent/agent-protocol';
import { checkAgentInput } from '@axe/core/agent/agent-schema';
import { type AgentToolDefinition, agentToolOf } from '@axe/core/agent/agent-tools';

import type { CallOutcome } from '../tab-link';
import { costOf, isPriced, promptTokensOf, tokensOf } from './gm-models';

/** The part of the API the game master uses, so that a stand-in can take its place in the specs. */
export interface GmApi {
  stream(
    body: Anthropic.MessageStreamParams,
    options: { readonly signal: AbortSignal }
  ): {
    finalMessage(): Promise<Anthropic.Message>;
    /** The response as far as it came, to reckon what a response that failed on the way still cost. */
    readonly currentMessage?: Anthropic.Message | undefined;
  };
}

/**
 * What the bridge may spend while it runs, whatever the tab asks: kept by the bridge and shared by
 * every start, so that a tab cannot spend more by stopping and starting again.
 */
export interface GmLedger {
  spentUsd: number;
  /** The most the bridge spends while it runs, or Infinity for no limit. */
  readonly limitUsd: number;
  /** The tokens models with no price have used while the bridge has run. */
  spentTokens: number;
  /** The most tokens such models use while the bridge runs, or Infinity for no limit. */
  readonly limitTokens: number;
}

/** Hands a tool call to the tab, as the bridge's link does. */
export type GmTabCall = (
  tool: string,
  args: Readonly<Record<string, unknown>>,
  timeoutMs: number,
  signal: AbortSignal
) => Promise<CallOutcome>;

/** What the game master tells the bridge of itself as it goes. */
export interface GmHooks {
  /** It wrote its notebook anew. */
  readonly notes: (notes: string) => void;
  /** It wrote a word aside, outside the tools, for the person at the seat. */
  readonly said: (text: string) => void;
  /** It spent something, or its conversation grew. */
  readonly changed: () => void;
}

/** Why a turn the game master was taking came to an end. */
export type TurnEnd =
  | { readonly kind: 'done' }
  /** Given up; `told` says whether what the turn was opened with had reached the conversation. */
  | { readonly kind: 'stopped'; readonly told: boolean }
  /** Out of the budget of this start (`start`) or of what the bridge may spend while it runs (`bridge`). */
  | { readonly kind: 'budget'; readonly of: 'start' | 'bridge' }
  | { readonly kind: 'key'; readonly message: string }
  | { readonly kind: 'failed'; readonly message: string };

/** A reason to take a turn, as the game master is told it. */
export type TurnReason = GmWake | 'nudge';

/** How many requests one turn may make before it is cut short. */
const REQUESTS_PER_TURN = 16;
/** How many requests setting the conversation aside may make. */
const REQUESTS_TO_SET_ASIDE = 4;
/** How far the conversation may grow, in tokens, before it is set aside after a turn. */
export const SET_ASIDE_AT = 80_000;
/** The most a response may write, its thinking included. */
const MAX_TOKENS = 16_000;
/** How long a tool call the tab runs is waited for. */
const TOOL_TIMEOUT_MS = 30_000;
/** The longest a tool's answer is handed back to the model. */
const RESULT_MAX = 20_000;
/** How much of the chat a new conversation opens on. */
const OPENING_CHAT_LINES = 30;
/** How many times a response that cannot be read is asked for again. */
const UNREADABLE_RETRIES = 2;

/** The tools as the API is given them: the table's and the notebook, inputs streamed as they are written. */
export const GM_API_TOOLS: readonly Anthropic.Tool[] = [...GM_TABLE_TOOLS, GM_NOTES_TOOL].map(
  (tool: AgentToolDefinition): Anthropic.Tool => ({
    name: tool.name,
    description: tool.description,
    input_schema: JSON.parse(JSON.stringify(tool.input)) as Anthropic.Tool.InputSchema,
    eager_input_streaming: true,
  })
);

/** A conversation under way: the system prompt it was opened with, and every message since, never rewritten. */
interface Conversation {
  readonly system: Anthropic.TextBlockParam[];
  readonly messages: Anthropic.MessageParam[];
}

function textOf(value: unknown): string {
  const text = JSON.stringify(value ?? null);
  return text.length > RESULT_MAX ? `${text.slice(0, RESULT_MAX)}… (cut short)` : text;
}

/**
 * The game master the bridge runs: one conversation with Claude, opened on the guide, the person's
 * instructions and the notebook, and carried on turn by turn. Each turn opens with what happened since
 * the last and runs the tools the model calls, the table's through the tab and the notebook here,
 * until it ends its turn. What it spends is reckoned from each response and checked against the budget
 * before every request. Once the conversation grows long it is set aside after the model writes its
 * notebook, and the next turn opens a new one on the notebook and the recent chat.
 */
export class GameMaster {
  private conversation: Conversation | null = null;
  private settings: GmSettings;
  private instructions: string;
  /** The notebook as it stands, written by the model or by the person at the seat. */
  notes: string;
  /** What the game master spent since it was started, in US dollars. */
  spentUsd = 0;
  /** How large the conversation had grown at the last response, in tokens. */
  contextTokens = 0;
  /** What to tell the model with the next turn, as the person at the seat said it. */
  private readonly toTell: string[] = [];

  constructor(
    private readonly api: GmApi,
    private readonly call: GmTabCall,
    private readonly hooks: GmHooks,
    start: { readonly settings: GmSettings; readonly instructions: string; readonly notes: string },
    private readonly ledger: GmLedger = { spentUsd: 0, limitUsd: Infinity, spentTokens: 0, limitTokens: Infinity }
  ) {
    this.settings = start.settings;
    this.instructions = start.instructions;
    this.notes = start.notes;
  }

  /** Whether a conversation is kept to carry on from. */
  get kept(): boolean {
    return this.conversation !== null;
  }

  get model(): string {
    return this.settings.model;
  }

  get budgetUsd(): number {
    return this.settings.budgetUsd;
  }

  /** Whether what the model run costs is known, so that it is held by dollars rather than by tokens. */
  get priced(): boolean {
    return isPriced(this.settings.model);
  }

  /**
   * Begins again, counting what this start spends from nothing: afresh, letting the conversation and
   * anything left to tell it go, or carrying on from the conversation kept.
   */
  restart(fresh: boolean): void {
    if (fresh) {
      this.conversation = null;
      this.toTell.length = 0;
    }
    this.spentUsd = 0;
  }

  /**
   * Takes what the person at the seat changed. A new model cannot read the old one's thinking, so the
   * conversation is set aside for it; new instructions or a notebook rewritten by hand are told to the
   * model with its next turn, leaving the system prompt and what is cached of it as they were.
   */
  update(settings: GmSettings, instructions: string, notes: string): void {
    if (settings.model !== this.settings.model) this.conversation = null;
    this.settings = settings;
    if (instructions !== this.instructions) {
      this.instructions = instructions;
      if (this.conversation) this.toTell.push(`The game master's instructions are now:\n${instructions}`);
    }
    if (notes !== this.notes) {
      this.notes = notes;
      if (this.conversation) this.toTell.push(`The person at your seat rewrote your notebook. It now reads:\n${notes}`);
    }
  }

  /** Takes a turn: why it came, what happened since the last, and a word from the person at the seat if any. */
  async takeTurn(
    reasons: readonly TurnReason[],
    events: readonly Readonly<Record<string, unknown>>[],
    direction: string,
    signal: AbortSignal
  ): Promise<TurnEnd> {
    const opening = !this.conversation;
    if (opening) {
      const opened = await this.open(signal);
      if (opened.kind !== 'done') return opened;
    }
    const conversation = this.conversation!;
    this.reclaimUnanswered(conversation);
    // A conversation just opened is asked to begin by its opening; anything more is told in a turn of its own.
    if (!opening || reasons.some((reason) => reason !== 'nudge') || events.length > 0) {
      conversation.messages.push({ role: 'user', content: gmTurnPrompt(reasons, events) });
    }
    if (direction.trim()) this.toTell.push(`The person at your seat says: ${direction.trim()}`);
    if (this.toTell.length > 0) {
      conversation.messages.push({ role: 'system', content: this.toTell.splice(0).join('\n\n') });
    }
    const end = await this.converse(conversation, REQUESTS_PER_TURN, signal, false);
    if (end.kind === 'stopped') return { kind: 'stopped', told: true };
    // Another model took over meanwhile: the conversation is no longer the one kept, and nothing is set aside.
    if (end.kind === 'done' && this.contextTokens > SET_ASIDE_AT && this.conversation === conversation) {
      return this.setAside(conversation, signal);
    }
    return end;
  }

  /**
   * Takes back a word to the model that no response followed, as a turn stopped or failed before the
   * model answered leaves one: a system message must be answered before anything else is said, so it
   * is told again with the next turn instead.
   */
  private reclaimUnanswered(conversation: Conversation): void {
    const last = conversation.messages.at(-1);
    if (last?.role !== 'system') return;
    conversation.messages.pop();
    this.toTell.unshift(
      typeof last.content === 'string' ? last.content : last.content.map((block) => block.text).join('\n')
    );
  }

  /** Opens a conversation on the room as it stands and the recent chat, read through the tab. */
  private async open(signal: AbortSignal): Promise<TurnEnd> {
    const room = await this.call('get_room', {}, TOOL_TIMEOUT_MS, signal);
    if (signal.aborted) return { kind: 'stopped', told: false };
    if (!room.ok) return { kind: 'failed', message: `${room.error.code}: ${room.error.message}` };
    const chat = await this.call('read_chat', { limit: OPENING_CHAT_LINES }, TOOL_TIMEOUT_MS, signal);
    if (signal.aborted) return { kind: 'stopped', told: false };
    const carriesOn = this.notes.trim() !== '';
    this.conversation = {
      system: [
        { type: 'text', text: GM_GUIDE },
        {
          type: 'text',
          text: gmBriefing(this.instructions, this.notes),
          cache_control: { type: 'ephemeral', ttl: '1h' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: gmOpeningPrompt(room.value, chat.ok ? chat.value : { error: chat.error.message }, carriesOn),
        },
      ],
    };
    this.toTell.length = 0;
    return { kind: 'done' };
  }

  /**
   * Asks the model to write its notebook, then lets the conversation go, so that the next turn opens a
   * new one on the notebook and the chat. The turn before is done either way: a setting aside given up
   * is tried again after the next turn.
   */
  private async setAside(conversation: Conversation, signal: AbortSignal): Promise<TurnEnd> {
    conversation.messages.push({ role: 'user', content: GM_SET_ASIDE_PROMPT });
    const end = await this.converse(conversation, REQUESTS_TO_SET_ASIDE, signal, true);
    if ((end.kind === 'done' || end.kind === 'failed') && this.conversation === conversation) this.conversation = null;
    return end.kind === 'stopped' ? { kind: 'done' } : end;
  }

  /** Asks the model, runs the tools it calls and asks again, until it ends its turn or a limit is met. */
  private async converse(
    conversation: Conversation,
    requests: number,
    signal: AbortSignal,
    notebookOnly: boolean
  ): Promise<TurnEnd> {
    for (let asked = 0; asked < requests; asked++) {
      // Another model took over meanwhile, and cannot read this conversation's thinking.
      if (this.conversation !== conversation) return { kind: 'done' };
      if (this.ledger.spentUsd >= this.ledger.limitUsd) return { kind: 'budget', of: 'bridge' };
      if (this.priced && this.spentUsd >= this.settings.budgetUsd) return { kind: 'budget', of: 'start' };
      if (!this.priced && this.ledger.spentTokens >= this.ledger.limitTokens) return { kind: 'budget', of: 'bridge' };
      let message: Anthropic.Message;
      try {
        message = await this.ask(conversation, signal);
      } catch (error) {
        // A request the API would not take may not be taken again: the conversation is let go of, to be
        // opened anew on the notebook.
        if (error instanceof BadRequestError && this.conversation === conversation) this.conversation = null;
        return this.endOf(error, signal);
      }
      this.charge(message.usage);
      this.contextTokens = promptTokensOf(message.usage) + message.usage.output_tokens;
      // A response with nothing in it, as one refused before it began, may not stand in the conversation.
      if (message.content.length > 0) conversation.messages.push({ role: 'assistant', content: message.content });
      for (const block of message.content) {
        if (block.type === 'text' && block.text.trim()) this.hooks.said(block.text.trim());
      }
      this.hooks.changed();
      const calls = message.content.filter((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use');
      if (message.stop_reason !== 'tool_use' || calls.length === 0) {
        // A response cut off or refused may end on a call that cannot be trusted: it is answered, not run.
        if (calls.length > 0) conversation.messages.push({ role: 'user', content: this.unrun(calls, 'was cut off') });
        if (message.stop_reason === 'refusal') return { kind: 'failed', message: 'The model declined to go on.' };
        if (message.stop_reason === 'max_tokens') return { kind: 'failed', message: 'The response was cut off.' };
        if (message.stop_reason === 'model_context_window_exceeded') this.contextTokens = Number.MAX_SAFE_INTEGER;
        return { kind: 'done' };
      }
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const call of calls) {
        if (signal.aborted) {
          results.push(...this.unrun(calls.slice(calls.indexOf(call)), 'was stopped'));
          break;
        }
        results.push(await this.run(call, signal, notebookOnly));
      }
      conversation.messages.push({ role: 'user', content: results });
      if (signal.aborted) return { kind: 'stopped', told: true };
    }
    return { kind: 'done' };
  }

  /**
   * Counts what a response cost against this start and against the bridge: in dollars for a model whose
   * prices are known, and in tokens against the bridge for one whose are not.
   */
  private charge(usage: Anthropic.Usage): void {
    const cost = costOf(this.settings.model, usage);
    this.spentUsd += cost;
    this.ledger.spentUsd += cost;
    if (!this.priced) this.ledger.spentTokens += tokensOf(usage);
  }

  /** Sends the conversation and waits for the whole response, asking again for one it could not read. */
  private async ask(conversation: Conversation, signal: AbortSignal): Promise<Anthropic.Message> {
    for (let attempt = 0; ; attempt++) {
      const stream = this.api.stream(
        {
          model: this.settings.model,
          max_tokens: MAX_TOKENS,
          thinking: { type: 'adaptive' },
          output_config: { effort: this.settings.effort },
          system: conversation.system,
          tools: [...GM_API_TOOLS],
          messages: conversation.messages,
          cache_control: { type: 'ephemeral' },
        },
        { signal }
      );
      try {
        return await stream.finalMessage();
      } catch (error) {
        // What came before it failed was still charged for.
        const partial = stream.currentMessage;
        if (partial) this.charge(partial.usage);
        // A tool input streamed as written may not parse; nothing but that is asked again.
        if (error instanceof APIError || signal.aborted || attempt >= UNREADABLE_RETRIES) throw error;
      }
    }
  }

  /** Runs one tool the model called: the notebook here, anything else on the tab. */
  private async run(
    call: Anthropic.ToolUseBlock,
    signal: AbortSignal,
    notebookOnly: boolean
  ): Promise<Anthropic.ToolResultBlockParam> {
    const answer = (content: string, isError = false): Anthropic.ToolResultBlockParam => ({
      type: 'tool_result',
      tool_use_id: call.id,
      content,
      ...(isError ? { is_error: true } : {}),
    });
    const input = (call.input ?? {}) as Record<string, unknown>;
    if (call.name === GM_NOTES_TOOL_NAME) {
      const problems = checkAgentInput(GM_NOTES_TOOL.input, input);
      if (problems.length > 0) return answer(`invalid_input: ${problems.join('; ')}`, true);
      this.notes = String(input['notes']);
      this.hooks.notes(this.notes);
      return answer('{"written":true}');
    }
    if (notebookOnly) return answer('not_allowed: Only update_notes may be used now.', true);
    const outcome = await this.call(call.name, input, agentToolOf(call.name)?.timeoutMs ?? TOOL_TIMEOUT_MS, signal);
    return outcome.ok ? answer(textOf(outcome.value)) : answer(`${outcome.error.code}: ${outcome.error.message}`, true);
  }

  /** Answers calls that were not run, as every call must be answered before the conversation goes on. */
  private unrun(calls: readonly Anthropic.ToolUseBlock[], why: string): Anthropic.ToolResultBlockParam[] {
    return calls.map((call) => ({
      type: 'tool_result',
      tool_use_id: call.id,
      content: `failed: The call ${why} and was not run.`,
      is_error: true,
    }));
  }

  private endOf(error: unknown, signal: AbortSignal): TurnEnd {
    if (signal.aborted || error instanceof APIUserAbortError) return { kind: 'stopped', told: true };
    if (error instanceof AuthenticationError || error instanceof PermissionDeniedError) {
      return { kind: 'key', message: error.message };
    }
    return { kind: 'failed', message: error instanceof Error ? error.message : String(error) };
  }
}
