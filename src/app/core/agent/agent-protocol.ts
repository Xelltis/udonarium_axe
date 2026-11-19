/**
 * The talk between a tab of Axe and the bridge that hands an AI's tool calls to it, over a WebSocket
 * on this computer. The bridge greets the tab, the tab tells it whose seat it is, and from then on the
 * bridge hands the tab calls and the tab answers each. Either end closes the socket on hearing a
 * version of the talk other than its own, so that a tool is never run on a definition it does not share.
 *
 * A bridge run as the game master (`gm`) talks to Claude itself: the tab starts and stops it, tells it
 * what happens in the room, and hears back how it stands, what it noted and what it said aside. A
 * bridge handing an AI app's calls on (`mcp`) is told the same, and hands the game master's turns to
 * that AI as it asks for them.
 */

/** The version of the talk. Raised on any change to the messages; the tools' definitions are compared by their digest. */
export const AGENT_PROTOCOL_VERSION = 5;

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

/**
 * What a bridge is run as: handing an AI app's tool calls on (`mcp`), with the game master's turns for
 * that AI to take where the tab starts one, or running the game master itself (`gm`).
 */
export type BridgeMode = 'mcp' | 'gm';

/** A model a game-master bridge can run, as the panel offers it. */
export interface GmModelOffer {
  readonly id: string;
  readonly name: string;
}

/** How long the game master thinks before it acts. */
export type GmEffort = 'low' | 'medium' | 'high';

/** What the game master is run with, chosen in the panel. */
export interface GmSettings {
  readonly model: string;
  readonly effort: GmEffort;
  /** What the game master may spend before it stops, in US dollars, as the bridge reckons it. */
  readonly budgetUsd: number;
}

/** Why the tab asks the game master to take its turn after an event. */
export type GmWake = 'line' | 'called' | 'turn';

/** Something that happened in the room, as the tab hands it on, and whether it asks for a turn. */
export interface GmEventEntry {
  readonly event: Readonly<Record<string, unknown>>;
  readonly wake?: GmWake;
}

/** Whether the game master runs, and if so whether it is waiting or taking its turn. */
export type GmRun = 'off' | 'waiting' | 'thinking';

/**
 * Why the game master stopped: asked to, out of budget, the key refused, turns failing, or the seat no
 * longer the game master's.
 */
export type GmHalt = 'asked' | 'budget' | 'key' | 'failed' | 'seat';

/** How the game master stands, as the bridge tells the panel. */
export interface GmStatus {
  readonly run: GmRun;
  readonly halted?: GmHalt;
  readonly model: string;
  readonly spentUsd: number;
  readonly budgetUsd: number;
  /** How large the conversation has grown, in tokens. */
  readonly contextTokens: number;
  /** Whether a conversation is kept to carry on from. */
  readonly kept: boolean;
  /** What went wrong last, for the panel to show. */
  readonly problem?: string;
  /**
   * For a model whose prices the bridge does not know: the tokens used while the bridge has run, and
   * the most it may use, which hold it in place of the sums of dollars. Left out for a priced model.
   */
  readonly tokens?: { readonly spent: number; readonly limit: number };
  /**
   * How many askings to start the bridge has answered since it was started itself. A tab that asked
   * tells the answer to its asking, which counts one more, from what the bridge told of itself before.
   */
  readonly starts: number;
  /**
   * For a bridge that hands the turns to an AI connected over MCP: whether that AI is there to take
   * them, waiting for its turn or having called a tool lately. Left out by a bridge that runs the model.
   */
  readonly attended?: boolean;
}

/** The longest the name of a model may be. */
export const GM_MODEL_NAME_MAX = 100;
/** The longest the game master's instructions may be. */
export const GM_INSTRUCTIONS_MAX = 50_000;
/** The longest the game master's notebook may be. */
export const GM_NOTES_MAX = 8_000;
/** The longest word the person at the seat may put to the game master at once. */
export const GM_DIRECTION_MAX = 2_000;
/** The most events handed on at once. */
const GM_EVENTS_MAX = 500;

/** What the bridge says to a tab. */
export type BridgeMessage =
  | {
      readonly type: 'hello';
      readonly protocol: number;
      readonly tools: string;
      readonly bridge: string;
      readonly mode: BridgeMode;
      /** The models a game-master bridge runs; none for an MCP bridge. */
      readonly models: readonly GmModelOffer[];
    }
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
  | { readonly type: 'cancel'; readonly id: string }
  | { readonly type: 'gm.status'; readonly status: GmStatus }
  | { readonly type: 'gm.notes'; readonly notes: string }
  | { readonly type: 'gm.said'; readonly text: string; readonly at: number };

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
  | { readonly type: 'result'; readonly id: string; readonly ok: false; readonly error: AgentError }
  | {
      readonly type: 'gm.start';
      readonly settings: GmSettings;
      readonly instructions: string;
      readonly notes: string;
      /** Whether to begin a new conversation rather than carry on from the one kept. */
      readonly fresh: boolean;
    }
  | { readonly type: 'gm.update'; readonly settings: GmSettings; readonly instructions: string; readonly notes: string }
  | { readonly type: 'gm.events'; readonly events: readonly GmEventEntry[] }
  | { readonly type: 'gm.nudge'; readonly direction: string }
  | { readonly type: 'gm.stop' };

/** What a game-master bridge tells the tab of itself. */
export type GmBridgeMessage = Extract<BridgeMessage, { type: 'gm.status' | 'gm.notes' | 'gm.said' }>;

/** What a tab tells a game-master bridge. */
export type GmTabMessage = Extract<
  TabMessage,
  { type: 'gm.start' | 'gm.update' | 'gm.events' | 'gm.nudge' | 'gm.stop' }
>;

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
const EFFORTS: readonly GmEffort[] = ['low', 'medium', 'high'];
const WAKES: readonly GmWake[] = ['line', 'called', 'turn'];
const RUNS: readonly GmRun[] = ['off', 'waiting', 'thinking'];
const HALTS: readonly GmHalt[] = ['asked', 'budget', 'key', 'failed', 'seat'];

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

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function textUpTo(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length <= max;
}

function modelsOf(raw: unknown): GmModelOffer[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return null;
  const models: GmModelOffer[] = [];
  for (const each of raw) {
    const model = recordOf(each);
    if (!model || !isText(model['id']) || !isText(model['name'])) return null;
    models.push({ id: model['id'], name: model['name'] });
  }
  return models;
}

/** Settings as a tab sent them, or null where one is missing or out of bounds. */
export function readGmSettings(raw: unknown): GmSettings | null {
  const settings = recordOf(raw);
  if (!settings || !textUpTo(settings['model'], GM_MODEL_NAME_MAX) || settings['model'] === '') return null;
  const effort = settings['effort'];
  const budget = settings['budgetUsd'];
  if (!EFFORTS.includes(effort as GmEffort)) return null;
  if (typeof budget !== 'number' || !Number.isFinite(budget) || budget <= 0 || budget > 1000) return null;
  return { model: settings['model'], effort: effort as GmEffort, budgetUsd: budget };
}

function statusOf(raw: unknown): GmStatus | null {
  const status = recordOf(raw);
  if (!status || !RUNS.includes(status['run'] as GmRun) || !isText(status['model'])) return null;
  if (!isCount(status['spentUsd']) || !isCount(status['budgetUsd']) || !isCount(status['contextTokens'])) return null;
  if (typeof status['kept'] !== 'boolean' || !isCount(status['starts'])) return null;
  const halted = status['halted'];
  if (halted !== undefined && !HALTS.includes(halted as GmHalt)) return null;
  const problem = status['problem'];
  if (problem !== undefined && !isText(problem)) return null;
  const tokens = status['tokens'] === undefined ? undefined : recordOf(status['tokens']);
  if (tokens === null || (tokens && (!isCount(tokens['spent']) || !isCount(tokens['limit'])))) return null;
  const attended = status['attended'];
  if (attended !== undefined && typeof attended !== 'boolean') return null;
  return {
    run: status['run'] as GmRun,
    ...(halted === undefined ? {} : { halted: halted as GmHalt }),
    model: status['model'],
    spentUsd: status['spentUsd'],
    budgetUsd: status['budgetUsd'],
    contextTokens: status['contextTokens'],
    kept: status['kept'],
    ...(problem === undefined ? {} : { problem }),
    ...(tokens ? { tokens: { spent: tokens['spent'] as number, limit: tokens['limit'] as number } } : {}),
    starts: status['starts'],
    ...(attended === undefined ? {} : { attended }),
  };
}

function eventsOf(raw: unknown): GmEventEntry[] | null {
  if (!Array.isArray(raw) || raw.length > GM_EVENTS_MAX) return null;
  const events: GmEventEntry[] = [];
  for (const each of raw) {
    const entry = recordOf(each);
    const event = entry ? recordOf(entry['event']) : null;
    if (!entry || !event) return null;
    const wake = entry['wake'];
    if (wake !== undefined && !WAKES.includes(wake as GmWake)) return null;
    events.push(wake === undefined ? { event } : { event, wake: wake as GmWake });
  }
  return events;
}

/** A message from the bridge, read from what came over the socket, or null for anything else. */
export function readBridgeMessage(raw: unknown): BridgeMessage | null {
  const message = recordOf(raw);
  if (!message) return null;
  switch (message['type']) {
    case 'hello': {
      const mode = message['mode'];
      const models = modelsOf(message['models']);
      return typeof message['protocol'] === 'number' &&
        isText(message['tools']) &&
        isText(message['bridge']) &&
        (mode === 'mcp' || mode === 'gm') &&
        models
        ? {
            type: 'hello',
            protocol: message['protocol'],
            tools: message['tools'],
            bridge: message['bridge'],
            mode,
            models,
          }
        : null;
    }
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
    case 'gm.status': {
      const status = statusOf(message['status']);
      return status ? { type: 'gm.status', status } : null;
    }
    case 'gm.notes':
      return textUpTo(message['notes'], GM_NOTES_MAX) ? { type: 'gm.notes', notes: message['notes'] } : null;
    case 'gm.said':
      return isText(message['text']) && isCount(message['at'])
        ? { type: 'gm.said', text: message['text'], at: message['at'] }
        : null;
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
    case 'gm.start':
    case 'gm.update': {
      const settings = readGmSettings(message['settings']);
      const { instructions, notes } = message;
      if (!settings || !textUpTo(instructions, GM_INSTRUCTIONS_MAX) || !textUpTo(notes, GM_NOTES_MAX)) return null;
      if (message['type'] === 'gm.update') return { type: 'gm.update', settings, instructions, notes };
      return { type: 'gm.start', settings, instructions, notes, fresh: message['fresh'] === true };
    }
    case 'gm.events': {
      const events = eventsOf(message['events']);
      return events ? { type: 'gm.events', events } : null;
    }
    case 'gm.nudge':
      return textUpTo(message['direction'], GM_DIRECTION_MAX)
        ? { type: 'gm.nudge', direction: message['direction'] }
        : null;
    case 'gm.stop':
      return { type: 'gm.stop' };
    default:
      return null;
  }
}
