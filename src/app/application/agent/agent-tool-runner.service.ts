import { inject, Injectable, signal } from '@angular/core';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { type AgentOutcome, outcomeOfError } from '@axe/core/agent/agent-error';
import type { AgentError, AgentScope } from '@axe/core/agent/agent-protocol';
import { checkAgentInput } from '@axe/core/agent/agent-schema';
import { type AgentAccess, agentToolOf } from '@axe/core/agent/agent-tools';
import { canRoleEdit, PeerRole } from '@axe/domain/peer/peer-role';

/** What a tool is given beside its input: a signal that says when the AI gave up on it. */
export interface AgentCallContext {
  readonly signal: AbortSignal;
}

/** What runs a tool: it returns what the AI is told, or throws an AgentToolError to refuse. */
export type AgentHandler = (args: Readonly<Record<string, unknown>>, context: AgentCallContext) => unknown;

/** A call the AI made that changed, or tried to change, the room, as the seat's panel lists it. */
export interface AgentHistoryEntry {
  readonly at: number;
  readonly tool: string;
  /** The input it was given, short enough for one line. */
  readonly input: string;
  /** Why it was not done, or null where it was. */
  readonly error: AgentError | null;
}

/** How many calls the history keeps. */
const HISTORY_LENGTH = 100;
const INPUT_LENGTH = 120;

/**
 * Why a seat may not run a tool needing some access, or null where it may: what the person at the
 * seat lets the AI do, and what the seat's own role may do, both bound it.
 */
export function refusalOf(access: AgentAccess, scope: AgentScope, role: PeerRole): AgentError | null {
  if (access === 'read') return null;
  if (!canRoleEdit(role)) {
    return { code: 'not_allowed', message: 'This seat watches the room and may not change it.' };
  }
  if (scope !== 'write') {
    return {
      code: 'not_allowed',
      message:
        'This seat lets the AI read the room only. Ask the person at the seat to allow changes in its AI link panel.',
    };
  }
  if (access === 'gm' && role !== PeerRole.GameMaster) {
    return { code: 'not_allowed', message: "Only the game master's seat may use this tool." };
  }
  return null;
}

/**
 * The layer of operations an AI drives the table through, apart from how it reaches the table: each
 * tool's input is checked against its definition and the seat's leave before it runs, what it throws
 * is turned into an answer, and the calls that change the room are kept for the seat to look over.
 */
@Injectable({ providedIn: 'root' })
export class AgentToolRunner {
  private readonly permission = inject(RolePermissionService);
  private readonly handlers = new Map<string, AgentHandler>();

  /** The calls that changed, or tried to change, the room, newest first. */
  readonly history = signal<readonly AgentHistoryEntry[]>([]);

  /** Makes tools runnable, each by its name. */
  provide(handlers: Readonly<Record<string, AgentHandler>>): void {
    for (const [name, handler] of Object.entries(handlers)) this.handlers.set(name, handler);
  }

  /** Whether a tool can be run here. */
  has(name: string): boolean {
    return this.handlers.has(name);
  }

  /** Runs a tool the AI called, as this seat, within what the person at the seat lets the AI do. */
  async run(
    tool: string,
    args: Readonly<Record<string, unknown>>,
    scope: AgentScope,
    signal: AbortSignal
  ): Promise<AgentOutcome> {
    const definition = agentToolOf(tool);
    if (!definition) return { ok: false, error: { code: 'unknown_tool', message: `There is no tool named ${tool}.` } };
    const problems = checkAgentInput(definition.input, args);
    if (problems.length > 0) return { ok: false, error: { code: 'invalid_input', message: problems.join('; ') } };
    const refusal = refusalOf(definition.access, scope, this.permission.role());
    const handler = this.handlers.get(tool);
    let outcome: AgentOutcome;
    if (refusal) outcome = { ok: false, error: refusal };
    else if (!handler)
      outcome = { ok: false, error: { code: 'unknown_tool', message: `${tool} cannot be used here yet.` } };
    else {
      try {
        outcome = { ok: true, value: (await handler(args, { signal })) ?? null };
      } catch (error) {
        outcome = outcomeOfError(error);
      }
    }
    if (definition.access !== 'read' || refusal) this.remember(tool, args, outcome);
    return outcome;
  }

  /** Forgets every call kept. */
  clearHistory(): void {
    this.history.set([]);
  }

  private remember(tool: string, args: Readonly<Record<string, unknown>>, outcome: AgentOutcome): void {
    const text = JSON.stringify(args);
    const entry: AgentHistoryEntry = {
      at: Date.now(),
      tool,
      input: text.length > INPUT_LENGTH ? `${text.slice(0, INPUT_LENGTH - 1)}…` : text,
      error: outcome.ok ? null : outcome.error,
    };
    this.history.update((entries) => [entry, ...entries].slice(0, HISTORY_LENGTH));
  }
}
