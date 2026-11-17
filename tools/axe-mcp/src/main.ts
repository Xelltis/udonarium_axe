import Anthropic from '@anthropic-ai/sdk';
import { AGENT_BRIDGE_PATH } from '@axe/core/agent/agent-protocol';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { GmHost } from './gm/gm-host';
import { GM_MODEL_OFFERS } from './gm/gm-models';
import { serveMcpOverHttp } from './http';
import { createMcpServer } from './mcp-server';
import { readOptions, USAGE } from './options';
import { TabLink } from './tab-link';

declare const __AXE_VERSION__: string | undefined;

/** The version of Axe this bridge was built with. */
const VERSION = typeof __AXE_VERSION__ === 'string' ? __AXE_VERSION__ : 'dev';

/** Everything the bridge says goes to standard error: standard output is the MCP channel. */
function log(line: string): void {
  process.stderr.write(`[axe-mcp] ${line}\n`);
}

async function main(): Promise<void> {
  const options = readOptions(process.argv.slice(2), process.env);
  if ('error' in options) {
    log(options.error);
    process.stderr.write(`${USAGE}\n`);
    process.exit(2);
  }
  if (options.help) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }
  if (options.version) {
    process.stdout.write(`${VERSION}\n`);
    return;
  }

  if (options.mode === 'gm') {
    await runGameMaster(options.port, options.origins, options.maxUsd);
    return;
  }

  const link = new TabLink({ port: options.port, origins: options.origins, bridge: VERSION, log });
  const port = await link.listen();
  log(`Axe MCP bridge ${VERSION}: waiting for a tab of Axe at ws://127.0.0.1:${port}${AGENT_BRIDGE_PATH}`);

  if (options.http !== null) {
    await serveMcpOverHttp(link, {
      port: options.http,
      origins: options.origins,
      token: options.token,
      version: VERSION,
      log,
    });
  }

  const stop = () => void link.close().then(() => process.exit(0));
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  if (options.http === null) {
    const transport = new StdioServerTransport();
    transport.onclose = stop;
    await createMcpServer(link, VERSION).connect(transport);
    // The socket a tab connects on would keep the bridge running after the AI that started it is
    // gone, holding the port from the next one, so it stops once its standard input ends.
    process.stdin.once('end', stop);
    process.stdin.once('close', stop);
  }
}

/**
 * Runs the game master: Claude through the API, with the key from the environment, acting on the tab
 * that connects. It runs until stopped with Ctrl+C, as nothing speaks to it on standard input.
 */
async function runGameMaster(tabPort: number, origins: readonly string[], maxUsd: number): Promise<void> {
  if (!process.env['ANTHROPIC_API_KEY']?.trim()) {
    log('gm needs a Claude API key: set ANTHROPIC_API_KEY before starting the bridge.');
    process.exit(2);
  }
  const client = new Anthropic({ maxRetries: 2 });
  const link = new TabLink({ port: tabPort, origins, bridge: VERSION, log, mode: 'gm', models: GM_MODEL_OFFERS });
  const host = new GmHost({
    link,
    api: { stream: (body, options) => client.messages.stream(body, options) },
    log,
    maxUsd,
  });
  const port = await link.listen();
  log(`Axe game master ${VERSION}: waiting for a tab of Axe at ws://127.0.0.1:${port}${AGENT_BRIDGE_PATH}`);
  log(`It spends at most $${maxUsd} while it runs (--max-usd).`);
  const stop = () => {
    host.close();
    void link.close().then(() => process.exit(0));
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((error: unknown) => {
  log(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
