import { randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from 'node:http';

import { GM_TURN_TOOL_NAME } from '@axe/core/agent/agent-gm';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import type { TurnDesk } from './gm/turn-desk';
import { isLoopbackHost } from './loopback';
import { createMcpServer } from './mcp-server';
import type { TabLink } from './tab-link';

/** The path MCP is served at over HTTP. */
export const MCP_HTTP_PATH = '/mcp';

/** The most of a request's body that is read; MCP's messages are far smaller. */
const MOST_BODY_BYTES = 4 * 1024 * 1024;

/** The body of a request as text, or null where it runs past {@link MOST_BODY_BYTES}. */
function bodyOf(req: IncomingMessage): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const parts: Buffer[] = [];
    let size = 0;
    req.on('data', (part: Buffer) => {
      size += part.length;
      if (size <= MOST_BODY_BYTES) parts.push(part);
    });
    req.on('end', () => resolve(size > MOST_BODY_BYTES ? null : Buffer.concat(parts).toString('utf-8')));
    req.on('error', reject);
  });
}

/** Whether a body of JSON-RPC messages, one or a batch, carries a call that waits for the game master's turn. */
function waitsForTurn(body: unknown): boolean {
  const messages = Array.isArray(body) ? body : [body];
  return messages.some((message) => {
    const call = message as { method?: unknown; params?: { name?: unknown } } | null;
    return call?.method === 'tools/call' && call.params?.name === GM_TURN_TOOL_NAME;
  });
}

export interface McpHttpOptions {
  readonly port: number;
  /** The pages a browser may call from; a client that is not a browser sends no page. */
  readonly origins: readonly string[];
  /** The bearer token a client must show, or null for none. */
  readonly token: string | null;
  readonly version: string;
  readonly log: (line: string) => void;
  /** The desk the game master's turns are handed to the AI at, shared by every client. */
  readonly desk?: TurnDesk;
}

function sameText(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function refuse(res: ServerResponse, status: number, text: string): void {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' }).end(text);
}

/**
 * Serves MCP over HTTP on this computer, for an AI program that connects by address rather than
 * starting the bridge itself: each client gets a session of its own, every session acting on the
 * same tab. A request by any other host name, from a page the bridge does not trust, or without the
 * token when one is set, is turned away before MCP reads it.
 */
export function serveMcpOverHttp(link: TabLink, options: McpHttpOptions): Promise<HttpServer> {
  /** The sessions open, each with the server that is its conversation with the desk that hands on the game master's turns. */
  const sessions = new Map<string, { transport: StreamableHTTPServerTransport; conversation: object }>();

  /**
   * Hands a request to its session's transport. A post is read first, and where it carries a wait for
   * the game master's turn, the desk is told should it be cut off before it is answered, as by an AI
   * program that went away: the transport goes on with a call whoever is left to read its answer, so
   * the wait would otherwise be handed a turn nobody reads. Any other request cut off leaves the wait
   * alone, as its own request still stands.
   */
  const handOn = async (
    req: IncomingMessage,
    res: ServerResponse,
    transport: StreamableHTTPServerTransport,
    conversation: object
  ): Promise<void> => {
    if (req.method !== 'POST') {
      await transport.handleRequest(req, res);
      return;
    }
    const text = await bodyOf(req);
    if (text === null) {
      refuse(res, 413, 'The request is too large.');
      return;
    }
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      res
        .writeHead(400, { 'content-type': 'application/json' })
        .end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' }, id: null }));
      return;
    }
    if (waitsForTurn(body)) {
      res.once('close', () => {
        if (!res.writableEnded) options.desk?.hungUp(conversation);
      });
    }
    await transport.handleRequest(req, res, body);
  };

  const refusal = (req: IncomingMessage): [number, string] | null => {
    if (!isLoopbackHost(req.headers.host)) return [403, 'Only requests to 127.0.0.1 or localhost are served.'];
    const origin = req.headers.origin;
    if (origin !== undefined && !options.origins.includes(origin)) {
      return [403, `Requests from ${origin} are not served.`];
    }
    if (options.token !== null) {
      const shown = req.headers.authorization ?? '';
      if (!sameText(shown, `Bearer ${options.token}`)) return [401, 'A bearer token is needed.'];
    }
    if ((req.url ?? '').split('?')[0] !== MCP_HTTP_PATH) return [404, `MCP is served at ${MCP_HTTP_PATH}.`];
    return null;
  };

  const server = createServer((req, res) => {
    const refused = refusal(req);
    if (refused) {
      refuse(res, ...refused);
      return;
    }
    const id = req.headers['mcp-session-id'];
    const known = typeof id === 'string' ? sessions.get(id) : undefined;
    if (known) {
      void handOn(req, res, known.transport, known.conversation);
      return;
    }
    if (typeof id === 'string') {
      refuse(res, 404, 'That session is over. Start a new one.');
      return;
    }
    const conversation = createMcpServer(link, options.version, options.desk);
    const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        sessions.set(sessionId, { transport, conversation });
      },
      onsessionclosed: (sessionId) => {
        sessions.delete(sessionId);
      },
    });
    transport.onclose = () => {
      if (transport.sessionId) sessions.delete(transport.sessionId);
      options.desk?.leave(conversation);
    };
    void conversation.connect(transport).then(() => handOn(req, res, transport, conversation));
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, '127.0.0.1', () => {
      options.log(`Serving MCP at http://127.0.0.1:${options.port}${MCP_HTTP_PATH}`);
      resolve(server);
    });
  });
}
