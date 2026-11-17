import {
  AGENT_BRIDGE_PATH,
  AGENT_PROTOCOL_VERSION,
  type AgentSeat,
  readBridgeMessage,
} from '@axe/core/agent/agent-protocol';
import { agentToolsDigest } from '@axe/core/agent/agent-tools';
import { WebSocket } from 'ws';

/** A stand-in for a tab of Axe, for the bridge's specs: it connects, answers calls as told, and keeps what it heard. */
export class TestTab {
  readonly heard: unknown[] = [];
  readonly socket: WebSocket;
  closed: Promise<{ code: number; reason: string }>;
  /** How the tab answers a call; it answers nothing where this returns undefined. */
  answer: (tool: string, args: Record<string, unknown>) => unknown = () => ({ done: true });

  constructor(port: number, origin = 'http://localhost:4200', host = `127.0.0.1:${port}`, autoPong = true) {
    this.socket = new WebSocket(`ws://127.0.0.1:${port}${AGENT_BRIDGE_PATH}`, { headers: { origin, host }, autoPong });
    this.closed = new Promise((resolve) =>
      this.socket.on('close', (code, reason) => resolve({ code, reason: reason.toString() }))
    );
    this.socket.on('message', (data) => {
      const message = readBridgeMessage(data.toString());
      this.heard.push(message);
      if (message?.type !== 'call') return;
      const value = this.answer(message.tool, { ...message.args });
      if (value !== undefined) this.socket.send(JSON.stringify({ type: 'result', id: message.id, ok: true, value }));
    });
    this.socket.on('error', () => undefined);
  }

  /** Waits for the socket to open, then says whose seat it is. */
  async welcome(seat: AgentSeat, protocol = AGENT_PROTOCOL_VERSION, tools = agentToolsDigest()): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.socket.once('open', () => resolve());
      this.socket.once('error', reject);
    });
    this.socket.send(JSON.stringify({ type: 'welcome', protocol, tools, app: '1.80.0', seat }));
  }

  /** Says something to the bridge as a tab would. */
  say(message: unknown): void {
    this.socket.send(JSON.stringify(message));
  }

  close(): void {
    this.socket.close();
  }
}

/** Waits until a test of the world holds, or fails after a while. */
export async function until(holds: () => boolean, ms = 3000): Promise<void> {
  const end = Date.now() + ms;
  while (!holds()) {
    if (Date.now() > end) throw new Error('waited too long');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
