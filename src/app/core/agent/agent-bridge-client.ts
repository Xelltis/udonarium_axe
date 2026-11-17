import { type AgentOutcome, outcomeOfError } from '@axe/core/agent/agent-error';
import {
  AGENT_BRIDGE_PATH,
  AGENT_PROTOCOL_VERSION,
  type AgentSeat,
  type BridgeMode,
  type GmBridgeMessage,
  type GmModelOffer,
  type GmTabMessage,
  readBridgeMessage,
  type TabMessage,
} from '@axe/core/agent/agent-protocol';
import { agentToolsDigest } from '@axe/core/agent/agent-tools';

/** Where the link to the bridge stands. */
export type AgentLinkState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'connecting' }
  | {
      readonly kind: 'connected';
      readonly bridge: string;
      readonly mode: BridgeMode;
      /** The models the bridge runs as the game master; none for an MCP bridge. */
      readonly models: readonly GmModelOffer[];
    }
  /** The bridge turned this tab away: another tab is connected, or its tools are not this tab's. */
  | { readonly kind: 'refused'; readonly reason: 'busy' | 'protocol'; readonly bridge: string }
  /** No bridge answered, or the one connected went away. */
  | { readonly kind: 'lost'; readonly unreachable: boolean };

/** The part of a WebSocket the client uses, so that a stand-in can take its place. */
export interface AgentSocket {
  readonly readyState: number;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export interface AgentBridgeClientOptions {
  /** The port the bridge waits on. */
  readonly port: number;
  /** The version of Axe this tab runs. */
  readonly app: string;
  /** Whose seat this tab is now, and what it lets the AI do. */
  readonly seat: () => AgentSeat;
  /** Runs a tool the AI called, giving it up once the signal says the AI did. */
  readonly run: (tool: string, args: Readonly<Record<string, unknown>>, signal: AbortSignal) => Promise<AgentOutcome>;
  readonly onState: (state: AgentLinkState) => void;
  /** Hears what a game-master bridge tells of itself. */
  readonly onGm?: (message: GmBridgeMessage) => void;
  readonly createSocket?: (url: string) => AgentSocket;
}

const OPEN = 1;

/**
 * This tab's side of the link to the bridge: it connects to the bridge on this computer, answers its
 * greeting with whose seat this is, runs each call the bridge hands it and answers it by its id, and
 * gives a call up when the bridge says the AI gave up on it. It turns away a bridge whose tools are not
 * this tab's, rather than running a tool on a definition the two do not share.
 */
export class AgentBridgeClient {
  private socket: AgentSocket | null = null;
  private state: AgentLinkState = { kind: 'idle' };
  private readonly running = new Map<string, AbortController>();

  constructor(private readonly options: AgentBridgeClientOptions) {}

  get current(): AgentLinkState {
    return this.state;
  }

  /** Connects to the bridge, letting go of any link before. */
  connect(): void {
    this.close();
    const url = `ws://127.0.0.1:${this.options.port}${AGENT_BRIDGE_PATH}`;
    let socket: AgentSocket;
    try {
      socket = this.options.createSocket ? this.options.createSocket(url) : (new WebSocket(url) as AgentSocket);
    } catch {
      this.become({ kind: 'lost', unreachable: true });
      return;
    }
    this.socket = socket;
    let opened = false;
    this.become({ kind: 'connecting' });
    socket.onopen = () => (opened = true);
    socket.onmessage = (event) => this.hear(socket, event.data);
    socket.onerror = () => undefined;
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.abortAll();
      if (this.state.kind !== 'refused') this.become({ kind: 'lost', unreachable: !opened });
    };
  }

  /** Lets go of the bridge, giving up every call this tab was running. */
  close(): void {
    const socket = this.socket;
    this.socket = null;
    this.abortAll();
    if (socket) {
      socket.onclose = null;
      socket.close(1000, 'closed');
    }
    if (this.state.kind !== 'idle') this.become({ kind: 'idle' });
  }

  /** Tells the bridge this seat anew, after its name, its role or what it lets the AI do changed. */
  tellSeat(): void {
    if (this.state.kind === 'connected' && this.socket)
      this.send(this.socket, { type: 'seat', seat: this.options.seat() });
  }

  /** Tells a game-master bridge something, returning whether it went: not while unconnected. */
  tellGm(message: GmTabMessage): boolean {
    if (this.state.kind !== 'connected' || !this.socket || this.socket.readyState !== OPEN) return false;
    this.send(this.socket, message);
    return true;
  }

  private hear(socket: AgentSocket, data: unknown): void {
    const text = typeof data === 'string' ? data : String(data);
    const message = readBridgeMessage(text);
    if (!message) {
      this.refuseUnreadable(socket, text);
      return;
    }
    switch (message.type) {
      case 'hello':
        if (message.protocol !== AGENT_PROTOCOL_VERSION || message.tools !== agentToolsDigest()) {
          this.become({ kind: 'refused', reason: 'protocol', bridge: message.bridge });
          socket.close(1000, 'protocol');
          return;
        }
        this.send(socket, {
          type: 'welcome',
          protocol: AGENT_PROTOCOL_VERSION,
          tools: agentToolsDigest(),
          app: this.options.app,
          seat: this.options.seat(),
        });
        this.become({ kind: 'connected', bridge: message.bridge, mode: message.mode, models: message.models });
        return;
      case 'refuse':
        this.become({ kind: 'refused', reason: message.reason, bridge: message.bridge });
        return;
      case 'call':
        void this.answer(socket, message.id, message.tool, message.args);
        return;
      case 'cancel':
        this.running.get(message.id)?.abort();
        return;
      case 'gm.status':
      case 'gm.notes':
      case 'gm.said':
        if (this.state.kind === 'connected') this.options.onGm?.(message);
        return;
    }
  }

  /**
   * Turns away a bridge whose greeting this tab cannot read, as one of another release may send,
   * rather than waiting on it for good. Anything else it cannot read is let pass.
   */
  private refuseUnreadable(socket: AgentSocket, text: string): void {
    let raw: { type?: unknown; bridge?: unknown } | null;
    try {
      raw = JSON.parse(text) as { type?: unknown; bridge?: unknown } | null;
    } catch {
      return;
    }
    if (this.state.kind !== 'connecting' || (raw?.type !== 'hello' && raw?.type !== 'refuse')) return;
    this.become({ kind: 'refused', reason: 'protocol', bridge: typeof raw.bridge === 'string' ? raw.bridge : '' });
    socket.close(1000, 'protocol');
  }

  private async answer(
    socket: AgentSocket,
    id: string,
    tool: string,
    args: Readonly<Record<string, unknown>>
  ): Promise<void> {
    const controller = new AbortController();
    this.running.set(id, controller);
    let outcome: AgentOutcome;
    try {
      outcome = await this.options.run(tool, args, controller.signal);
    } catch (error) {
      outcome = outcomeOfError(error);
    }
    this.running.delete(id);
    if (controller.signal.aborted || this.socket !== socket) return;
    this.send(
      socket,
      outcome.ok
        ? { type: 'result', id, ok: true, value: outcome.value }
        : { type: 'result', id, ok: false, error: outcome.error }
    );
  }

  private abortAll(): void {
    for (const controller of this.running.values()) controller.abort();
    this.running.clear();
  }

  private become(state: AgentLinkState): void {
    this.state = state;
    this.options.onState(state);
  }

  private send(socket: AgentSocket, message: TabMessage): void {
    if (socket.readyState === OPEN) socket.send(JSON.stringify(message));
  }
}
