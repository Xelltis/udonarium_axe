import { randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from 'node:http';

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { isLoopbackHost } from './loopback';
import { createMcpServer } from './mcp-server';
import type { TabLink } from './tab-link';

/** The path MCP is served at over HTTP. */
export const MCP_HTTP_PATH = '/mcp';

export interface McpHttpOptions {
  readonly port: number;
  /** The pages a browser may call from; a client that is not a browser sends no page. */
  readonly origins: readonly string[];
  /** The bearer token a client must show, or null for none. */
  readonly token: string | null;
  readonly version: string;
  readonly log: (line: string) => void;
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
  const sessions = new Map<string, StreamableHTTPServerTransport>();

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
      void known.handleRequest(req, res);
      return;
    }
    if (typeof id === 'string') {
      refuse(res, 404, 'That session is over. Start a new one.');
      return;
    }
    const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        sessions.set(sessionId, transport);
      },
      onsessionclosed: (sessionId) => {
        sessions.delete(sessionId);
      },
    });
    transport.onclose = () => {
      if (transport.sessionId) sessions.delete(transport.sessionId);
    };
    void createMcpServer(link, options.version)
      .connect(transport)
      .then(() => transport.handleRequest(req, res));
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, '127.0.0.1', () => {
      options.log(`Serving MCP at http://127.0.0.1:${options.port}${MCP_HTTP_PATH}`);
      resolve(server);
    });
  });
}
