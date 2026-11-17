import Anthropic from '@anthropic-ai/sdk';
import { AGENT_BRIDGE_PATH } from '@axe/core/agent/agent-protocol';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import type { GmApi } from './gm/game-master';
import { GmHost } from './gm/gm-host';
import { gmModelOffers, namedModel, useGmModels } from './gm/gm-models';
import { openAiApi } from './gm/openai-api';
import { serveMcpOverHttp } from './http';
import { createMcpServer } from './mcp-server';
import { type BridgeOptions, readOptions, USAGE } from './options';
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
    await runGameMaster(options);
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
 * The way to the provider the game master is run on, with the key from the environment: Claude's API,
 * or the chat completions API of another, whose models are offered by the names given at the start.
 */
function gameMasterApi(options: BridgeOptions): GmApi {
  if (options.provider === 'openai') {
    useGmModels(options.models.map((name) => namedModel(name, options.price)));
    return openAiApi({ baseUrl: options.baseUrl, apiKey: process.env['AXE_GM_API_KEY']?.trim() ?? '' });
  }
  if (!process.env['ANTHROPIC_API_KEY']?.trim()) {
    log('gm needs a Claude API key: set ANTHROPIC_API_KEY before starting the bridge.');
    process.exit(2);
  }
  const client = new Anthropic({ maxRetries: 2 });
  return { stream: (body, sending) => client.messages.stream(body, sending) };
}

/**
 * Runs the game master: an AI through its provider's API, acting on the tab that connects. It runs
 * until stopped with Ctrl+C, as nothing speaks to it on standard input.
 */
async function runGameMaster(options: BridgeOptions): Promise<void> {
  const api = gameMasterApi(options);
  const link = new TabLink({
    port: options.port,
    origins: options.origins,
    bridge: VERSION,
    log,
    mode: 'gm',
    models: gmModelOffers(),
  });
  const host = new GmHost({ link, api, log, maxUsd: options.maxUsd, maxTokens: options.maxTokens });
  const port = await link.listen();
  log(`Axe game master ${VERSION}: waiting for a tab of Axe at ws://127.0.0.1:${port}${AGENT_BRIDGE_PATH}`);
  if (options.provider === 'openai') log(`It runs ${options.models.join(', ')} at ${options.baseUrl}.`);
  log(`It spends at most $${options.maxUsd} while it runs (--max-usd).`);
  if (options.provider === 'openai' && !options.price) {
    log(`No price was given, so it uses at most ${options.maxTokens} tokens while it runs (--max-tokens).`);
  }
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
