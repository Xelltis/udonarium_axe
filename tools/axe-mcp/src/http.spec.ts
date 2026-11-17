import { request, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

import { MCP_HTTP_PATH, serveMcpOverHttp } from './http';
import { TabLink } from './tab-link';
import { TestTab, until } from './test-tab';

describe('serveMcpOverHttp', () => {
  let link: TabLink;
  let tabPort: number;
  let server: HttpServer;
  let url: string;
  const clients: Client[] = [];

  async function serve(token: string | null): Promise<void> {
    server = await serveMcpOverHttp(link, {
      port: 0,
      origins: ['http://localhost:4200'],
      token,
      version: '1.80.0',
      log: () => undefined,
    });
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}${MCP_HTTP_PATH}`;
  }

  async function connect(headers: Record<string, string> = {}): Promise<Client> {
    const client = new Client({ name: 'spec', version: '1' });
    await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers } }));
    clients.push(client);
    return client;
  }

  /** The status of a request that names another host, as a page rebound by DNS would; fetch cannot name one. */
  function statusByHost(host: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const sent = request(url, { method: 'POST', headers: { host, authorization: 'Bearer secret' } }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      });
      sent.on('error', reject);
      sent.end('{}');
    });
  }

  beforeEach(async () => {
    link = new TabLink({
      port: 0,
      origins: ['http://localhost:4200'],
      bridge: '1.80.0',
      log: () => undefined,
      tabGraceMs: 0,
    });
    tabPort = await link.listen();
  });

  afterEach(async () => {
    for (const client of clients.splice(0)) await client.close();
    await new Promise((resolve) => server.close(resolve));
    await link.close();
  });

  it('serves each client a session of its own, all acting on the one tab', async () => {
    await serve(null);
    const axe = new TestTab(tabPort);
    axe.answer = (tool) => ({ tool });
    await axe.welcome({ name: 'AI GM', role: 'gm', scope: 'read' });
    await until(() => link.current !== null);

    const first = await connect();
    const second = await connect();

    expect((await first.listTools()).tools.length).toBeGreaterThan(20);
    expect(await second.callTool({ name: 'get_room', arguments: {} })).toMatchObject({
      content: [{ type: 'text', text: '{"tool":"get_room"}' }],
    });
    axe.close();
  });

  it('turns away a page it does not trust, another host name, a stray path and a missing token', async () => {
    await serve('secret');
    const post = (headers: Record<string, string>, path = MCP_HTTP_PATH) =>
      fetch(url.replace(MCP_HTTP_PATH, path), {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
      });

    expect((await post({ authorization: 'Bearer secret', origin: 'https://evil.example' })).status).toBe(403);
    expect(await statusByHost('attacker.example')).toBe(403);
    expect((await post({ authorization: 'Bearer wrong' })).status).toBe(401);
    expect((await post({})).status).toBe(401);
    expect((await post({ authorization: 'Bearer secret' }, '/other')).status).toBe(404);
    expect((await post({ authorization: 'Bearer secret', 'mcp-session-id': 'gone' })).status).toBe(404);

    const client = await connect({ authorization: 'Bearer secret', origin: 'http://localhost:4200' });
    expect((await client.listPrompts()).prompts).toHaveLength(1);
  });
});
