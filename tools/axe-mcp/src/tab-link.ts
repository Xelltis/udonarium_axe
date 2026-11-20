import type { IncomingMessage } from 'node:http';

import {
  AGENT_BRIDGE_PATH,
  AGENT_PROTOCOL_VERSION,
  type AgentError,
  type AgentSeat,
  type BridgeMessage,
  type BridgeMode,
  type GmBridgeMessage,
  type GmModelOffer,
  type GmTabMessage,
  readTabMessage,
} from '@axe/core/agent/agent-protocol';
import { AGENT_TOOLS, agentToolsDigest, MAX_AGENT_MESSAGE_BYTES } from '@axe/core/agent/agent-tools';
import { WebSocket, WebSocketServer } from 'ws';

import { type LocalFiles, type ToolCall, withLocalFiles } from './local-files';
import { isLoopbackHost } from './loopback';

/** The tab the bridge is connected to, and whose seat it is. */
export interface ConnectedTab {
  /** The version of Axe the tab runs. */
  readonly app: string;
  readonly seat: AgentSeat;
}

/** What came of handing a tab a call. */
export type CallOutcome =
  { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly error: AgentError };

export interface TabLinkOptions {
  readonly port: number;
  /** The pages a tab may connect from. */
  readonly origins: readonly string[];
  /** The version of the bridge, as the tab is told it. */
  readonly bridge: string;
  /** What the bridge is run as, as the tab is told it: `mcp` unless said. */
  readonly mode?: BridgeMode;
  /** The models a game-master bridge runs, as the tab is told them. */
  readonly models?: readonly GmModelOffer[];
  readonly log: (line: string) => void;
  /** How often the tab is asked whether it is still there, in milliseconds. */
  readonly heartbeatMs?: number;
  /**
   * How long a call waits for a tab while none is connected, in milliseconds: a tab whose person
   * pressed Connect looks for the bridge every few seconds, so an AI that calls at once as it starts
   * would otherwise be told no tab is there a moment before one is.
   */
  readonly tabGraceMs?: number;
  /**
   * The files of the person's computer a call may read or write (see `withLocalFiles`): every call,
   * whoever makes it, goes through them. None, and no file is read or written, where not given.
   */
  readonly files?: LocalFiles;
}

/** How long a call waits for a tab to connect, unless told otherwise. */
const TAB_GRACE_MS = 8000;

/** What an AI is told while no tab is connected. */
export const NOT_CONNECTED =
  'No tab of Axe is connected. Open Axe, open the AI link panel from the menu and press Connect, then try again.';

/** The close codes the bridge turns a tab away with. */
const BUSY_CLOSE = 4001;
const PROTOCOL_CLOSE = 4002;

interface Pending {
  readonly resolve: (outcome: CallOutcome) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

/**
 * The bridge's side of the WebSocket a tab of Axe connects to: one tab at a time, from a page it
 * trusts, on this computer only. It greets the tab, hears whose seat it is, and hands it the AI's
 * calls, each answered by its id or given up after a while.
 */
export class TabLink {
  private server: WebSocketServer | null = null;
  private socket: WebSocket | null = null;
  private tab: ConnectedTab | null = null;
  private failure: string | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private readonly pending = new Map<string, Pending>();
  private readonly listeners = new Set<(tab: ConnectedTab | null) => void>();
  private readonly gmListeners = new Set<(message: GmTabMessage) => void>();
  private nextId = 1;

  constructor(private readonly options: TabLinkOptions) {}

  /** The tab connected now, or null. */
  get current(): ConnectedTab | null {
    return this.tab;
  }

  /** Starts waiting for a tab, and says on which port; a port taken by another program is told to the AI. */
  listen(): Promise<number> {
    return new Promise((resolve) => {
      const server = new WebSocketServer({
        host: '127.0.0.1',
        port: this.options.port,
        maxPayload: MAX_AGENT_MESSAGE_BYTES,
        path: AGENT_BRIDGE_PATH,
        verifyClient: ({ origin, req }: { origin: string; req: IncomingMessage }) => this.admits(origin, req),
      });
      server.on('listening', () => {
        this.server = server;
        const address = server.address();
        resolve(typeof address === 'object' && address ? address.port : this.options.port);
      });
      server.on('error', (error: NodeJS.ErrnoException) => {
        this.failure =
          error.code === 'EADDRINUSE'
            ? `The bridge could not wait for Axe on port ${this.options.port}: another program uses it, ` +
              'perhaps another bridge. Close it, or start this bridge with --port and set the same port in Axe.'
            : `The bridge could not wait for Axe: ${error.message}`;
        this.options.log(this.failure);
        resolve(this.options.port);
      });
      server.on('connection', (socket) => this.greet(socket));
      this.heartbeat = setInterval(() => this.checkAlive(), this.options.heartbeatMs ?? 20_000);
    });
  }

  /** Stops waiting, lets the tab go, and gives up every call still waiting. */
  close(): Promise<void> {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    this.socket?.terminate();
    this.forget();
    const server = this.server;
    this.server = null;
    return new Promise((resolve) => (server ? server.close(() => resolve()) : resolve()));
  }

  /** Tells a listener whenever a tab comes or goes, or tells whose seat it is anew. */
  onChange(listener: (tab: ConnectedTab | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Hears what the tab tells a game-master bridge. */
  onGm(listener: (message: GmTabMessage) => void): () => void {
    this.gmListeners.add(listener);
    return () => this.gmListeners.delete(listener);
  }

  /** Tells the connected tab how the game master stands, returning whether there was a tab to tell. */
  tellGm(message: GmBridgeMessage): boolean {
    if (!this.tab || !this.socket) return false;
    this.send(this.socket, message);
    return true;
  }

  /**
   * Hands the tab a call and answers what came of it, the files a tool names read and written on the
   * way (see `withLocalFiles`), for the MCP clients and the bridge's own game master alike.
   */
  call(
    tool: string,
    args: Readonly<Record<string, unknown>>,
    timeoutMs: number,
    signal?: AbortSignal
  ): Promise<CallOutcome> {
    const files = this.options.files;
    const callTab: ToolCall = (name, input, ms, abort) => this.callTab(name, input, ms, abort);
    return files
      ? withLocalFiles(callTab, files, AGENT_TOOLS)(tool, args, timeoutMs, signal)
      : callTab(tool, args, timeoutMs, signal);
  }

  /**
   * Hands the tab a call and waits for its answer, giving it up after the time given or once the
   * caller gives up on it, and telling the tab so.
   */
  private async callTab(
    tool: string,
    args: Readonly<Record<string, unknown>>,
    timeoutMs: number,
    signal?: AbortSignal
  ): Promise<CallOutcome> {
    const cancelled: CallOutcome = { ok: false, error: { code: 'failed', message: `${tool} was cancelled.` } };
    if (!this.tab && !this.failure) await this.tabOrTimeUp(this.options.tabGraceMs ?? TAB_GRACE_MS, signal);
    const socket = this.socket;
    if (!this.tab || !socket) {
      return { ok: false, error: { code: 'not_connected', message: this.failure ?? NOT_CONNECTED } };
    }
    if (signal?.aborted) return cancelled;
    const id = `c${this.nextId++}`;
    return new Promise<CallOutcome>((resolve) => {
      const giveUp = (outcome: CallOutcome) => {
        if (!this.pending.has(id)) return;
        this.settle(id, outcome);
        this.send(socket, { type: 'cancel', id });
      };
      const onAbort = () => giveUp(cancelled);
      const timer = setTimeout(
        () => giveUp({ ok: false, error: { code: 'timeout', message: `${tool} took too long to answer.` } }),
        timeoutMs
      );
      this.pending.set(id, {
        resolve: (outcome) => {
          signal?.removeEventListener('abort', onAbort);
          resolve(outcome);
        },
        timer,
      });
      signal?.addEventListener('abort', onAbort, { once: true });
      this.send(socket, { type: 'call', id, tool, args });
    });
  }

  /** Waits until a tab connects, the time is up, or the caller gives up, whichever comes first. */
  private tabOrTimeUp(ms: number, signal?: AbortSignal): Promise<void> {
    if (ms <= 0 || signal?.aborted) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        stop();
        signal?.removeEventListener('abort', done);
        resolve();
      };
      const stop = this.onChange((tab) => {
        if (tab) done();
      });
      const timer = setTimeout(done, ms);
      signal?.addEventListener('abort', done, { once: true });
    });
  }

  /** Whether a socket may connect: on this computer's own name, from a page the bridge trusts. */
  private admits(origin: string, req: IncomingMessage): boolean {
    if (!isLoopbackHost(req.headers.host)) {
      this.options.log(`Turned away a tab that came by the host name ${req.headers.host ?? '(none)'}.`);
      return false;
    }
    if (!this.options.origins.includes(origin)) {
      this.options.log(
        `Turned away a tab from ${origin || '(no page)'}: start the bridge with --allow-origin to accept it.`
      );
      return false;
    }
    return true;
  }

  private greet(socket: WebSocket): void {
    const hello = { protocol: AGENT_PROTOCOL_VERSION, tools: agentToolsDigest(), bridge: this.options.bridge };
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.send(socket, { type: 'refuse', reason: 'busy', ...hello });
      socket.close(BUSY_CLOSE, 'busy');
      return;
    }
    if (this.socket) {
      this.socket.terminate();
      this.forget();
    }
    this.socket = socket;
    (socket as WebSocket & { alive?: boolean }).alive = true;
    socket.on('pong', () => ((socket as WebSocket & { alive?: boolean }).alive = true));
    socket.on('message', (data) => this.hear(socket, data.toString()));
    socket.on('close', () => {
      if (this.socket !== socket) return;
      const had = this.tab;
      this.forget();
      if (had) {
        this.options.log(`The tab of ${had.seat.name} went away.`);
        this.tell(null);
      }
    });
    socket.on('error', () => socket.terminate());
    this.send(socket, { type: 'hello', ...hello, mode: this.options.mode ?? 'mcp', models: this.options.models ?? [] });
  }

  private hear(socket: WebSocket, text: string): void {
    const message = readTabMessage(text);
    if (!message) return;
    switch (message.type) {
      case 'welcome':
        if (message.protocol !== AGENT_PROTOCOL_VERSION || message.tools !== agentToolsDigest()) {
          this.options.log(
            `Turned away a tab of Axe ${message.app}: its tools are not this bridge's (${this.options.bridge}). ` +
              'Use the bridge of the same release as Axe.'
          );
          this.send(socket, {
            type: 'refuse',
            reason: 'protocol',
            protocol: AGENT_PROTOCOL_VERSION,
            tools: agentToolsDigest(),
            bridge: this.options.bridge,
          });
          socket.close(PROTOCOL_CLOSE, 'protocol');
          return;
        }
        this.tab = { app: message.app, seat: message.seat };
        this.options.log(
          `Connected to the tab of ${message.seat.name} (${message.seat.role}, ${message.seat.scope}) on Axe ${message.app}.`
        );
        this.tell(this.tab);
        return;
      case 'seat':
        if (!this.tab) return;
        this.tab = { ...this.tab, seat: message.seat };
        this.tell(this.tab);
        return;
      case 'result':
        this.settle(message.id, message.ok ? { ok: true, value: message.value } : { ok: false, error: message.error });
        return;
      default:
        if (this.tab && this.socket === socket) for (const listener of this.gmListeners) listener(message);
        return;
    }
  }

  private settle(id: string, outcome: CallOutcome): void {
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);
    clearTimeout(pending.timer);
    pending.resolve(outcome);
  }

  /** Lets the tab go, giving up every call it was answering. */
  private forget(): void {
    this.socket = null;
    this.tab = null;
    for (const id of [...this.pending.keys()]) {
      this.settle(id, { ok: false, error: { code: 'not_connected', message: `The tab went away. ${NOT_CONNECTED}` } });
    }
  }

  private checkAlive(): void {
    const socket = this.socket as (WebSocket & { alive?: boolean }) | null;
    if (!socket) return;
    if (!socket.alive) {
      socket.terminate();
      return;
    }
    socket.alive = false;
    socket.ping();
  }

  private tell(tab: ConnectedTab | null): void {
    for (const listener of this.listeners) listener(tab);
  }

  private send(socket: WebSocket, message: BridgeMessage): void {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }
}
