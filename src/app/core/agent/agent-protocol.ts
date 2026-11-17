/**
 * The talk between a tab of Axe and the bridge that hands an AI's tool calls to it, over a WebSocket
 * on this computer. The bridge greets the tab, the tab tells it whose seat it is, and from then on the
 * bridge hands the tab calls and the tab answers each. Either end closes the socket on hearing a
 * version of the talk other than its own, so that a tool is never run on a definition it does not share.
 */

/** The version of the talk. Raised on any change to the messages; the tools' definitions are compared by their digest. */
export const AGENT_PROTOCOL_VERSION = 1;

/** The port the bridge waits for a tab on, unless told another. */
export const AGENT_BRIDGE_PORT = 47610;

/** The path on that port a tab connects to. */
export const AGENT_BRIDGE_PATH = '/axe';

/**
 * The pages of Axe the bridge accepts a tab from unless told more: where Axe is served, and where it
 * is developed and tested. Axe served from anywhere else is added when the bridge is started.
 */
export const AGENT_TRUSTED_ORIGINS: readonly string[] = [
  'https://axe.xelltis.com',
  'https://trpg.savage-tribe.com',
  'https://trpg2.savage-tribe.com',
  'http://localhost:4200',
  'http://127.0.0.1:4200',
  'http://localhost:4300',
  'http://127.0.0.1:4300',
];

/** What the AI connected to a seat may do: read the room only, or change it too. */
export type AgentScope = 'read' | 'write';

/** The role of a seat, as the AI is told it. */
export type AgentSeatRole = 'gm' | 'pl' | 'guest';

/** Whose seat a tab is, as the bridge is told it. */
export interface AgentSeat {
  readonly name: string;
  readonly role: AgentSeatRole;
  readonly scope: AgentScope;
}

/** Why a tool call was not done, for the AI to tell what to do about it. */
export type AgentErrorCode =
  'not_connected' | 'not_allowed' | 'not_found' | 'ambiguous' | 'invalid_input' | 'unknown_tool' | 'failed' | 'timeout';

export interface AgentError {
  readonly code: AgentErrorCode;
  readonly message: string;
}

/** Why the bridge turned a tab away. */
export type AgentRefusal = 'protocol' | 'busy';

/** What the bridge says to a tab. */
export type BridgeMessage =
  | { readonly type: 'hello'; readonly protocol: number; readonly tools: string; readonly bridge: string }
  | {
      readonly type: 'refuse';
      readonly reason: AgentRefusal;
      readonly protocol: number;
      readonly tools: string;
      readonly bridge: string;
    }
  | {
      readonly type: 'call';
      readonly id: string;
      readonly tool: string;
      readonly args: Readonly<Record<string, unknown>>;
    }
  | { readonly type: 'cancel'; readonly id: string };

/** What a tab says to the bridge. */
export type TabMessage =
  | {
      readonly type: 'welcome';
      readonly protocol: number;
      readonly tools: string;
      readonly app: string;
      readonly seat: AgentSeat;
    }
  | { readonly type: 'seat'; readonly seat: AgentSeat }
  | { readonly type: 'result'; readonly id: string; readonly ok: true; readonly value: unknown }
  | { readonly type: 'result'; readonly id: string; readonly ok: false; readonly error: AgentError };

const ERROR_CODES: readonly AgentErrorCode[] = [
  'not_connected',
  'not_allowed',
  'not_found',
  'ambiguous',
  'invalid_input',
  'unknown_tool',
  'failed',
  'timeout',
];
const ROLES: readonly AgentSeatRole[] = ['gm', 'pl', 'guest'];
const SCOPES: readonly AgentScope[] = ['read', 'write'];

function recordOf(raw: unknown): Record<string, unknown> | null {
  if (typeof raw === 'string') {
    try {
      return recordOf(JSON.parse(raw));
    } catch {
      return null;
    }
  }
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
}

function isText(value: unknown): value is string {
  return typeof value === 'string';
}

function seatOf(raw: unknown): AgentSeat | null {
  const seat = recordOf(raw);
  if (!seat || !isText(seat['name'])) return null;
  const role = seat['role'];
  const scope = seat['scope'];
  if (!ROLES.includes(role as AgentSeatRole) || !SCOPES.includes(scope as AgentScope)) return null;
  return { name: seat['name'], role: role as AgentSeatRole, scope: scope as AgentScope };
}

/** A message from the bridge, read from what came over the socket, or null for anything else. */
export function readBridgeMessage(raw: unknown): BridgeMessage | null {
  const message = recordOf(raw);
  if (!message) return null;
  switch (message['type']) {
    case 'hello':
      return typeof message['protocol'] === 'number' && isText(message['tools']) && isText(message['bridge'])
        ? { type: 'hello', protocol: message['protocol'], tools: message['tools'], bridge: message['bridge'] }
        : null;
    case 'refuse': {
      const reason = message['reason'];
      if (reason !== 'protocol' && reason !== 'busy') return null;
      return typeof message['protocol'] === 'number' && isText(message['tools']) && isText(message['bridge'])
        ? { type: 'refuse', reason, protocol: message['protocol'], tools: message['tools'], bridge: message['bridge'] }
        : null;
    }
    case 'call': {
      const args = message['args'] === undefined ? {} : recordOf(message['args']);
      return isText(message['id']) && isText(message['tool']) && args
        ? { type: 'call', id: message['id'], tool: message['tool'], args }
        : null;
    }
    case 'cancel':
      return isText(message['id']) ? { type: 'cancel', id: message['id'] } : null;
    default:
      return null;
  }
}

/** A message from a tab, read from what came over the socket, or null for anything else. */
export function readTabMessage(raw: unknown): TabMessage | null {
  const message = recordOf(raw);
  if (!message) return null;
  switch (message['type']) {
    case 'welcome': {
      const seat = seatOf(message['seat']);
      return seat && typeof message['protocol'] === 'number' && isText(message['tools']) && isText(message['app'])
        ? { type: 'welcome', protocol: message['protocol'], tools: message['tools'], app: message['app'], seat }
        : null;
    }
    case 'seat': {
      const seat = seatOf(message['seat']);
      return seat ? { type: 'seat', seat } : null;
    }
    case 'result': {
      if (!isText(message['id'])) return null;
      if (message['ok'] === true) return { type: 'result', id: message['id'], ok: true, value: message['value'] };
      const error = recordOf(message['error']);
      if (message['ok'] !== false || !error || !isText(error['message'])) return null;
      const code = ERROR_CODES.includes(error['code'] as AgentErrorCode) ? (error['code'] as AgentErrorCode) : 'failed';
      return { type: 'result', id: message['id'], ok: false, error: { code, message: error['message'] } };
    }
    default:
      return null;
  }
}
