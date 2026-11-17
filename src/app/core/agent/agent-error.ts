import type { AgentError, AgentErrorCode } from '@axe/core/agent/agent-protocol';

/** A tool's refusal or failure, with what the AI is to be told of it. */
export class AgentToolError extends Error {
  constructor(
    readonly code: AgentErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'AgentToolError';
  }
}

/** What came of running a tool, as it is handed back to the bridge. */
export type AgentOutcome =
  { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly error: AgentError };

/** The outcome a thrown thing comes to: a tool's own refusal as it was, anything else as a failure. */
export function outcomeOfError(error: unknown): AgentOutcome {
  if (error instanceof AgentToolError) return { ok: false, error: { code: error.code, message: error.message } };
  const message = error instanceof Error ? error.message : String(error);
  return { ok: false, error: { code: 'failed', message: message || 'The tool failed.' } };
}
