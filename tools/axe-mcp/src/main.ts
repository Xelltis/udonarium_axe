import { AGENT_BRIDGE_PATH } from '@axe/core/agent/agent-protocol';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

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

main().catch((error: unknown) => {
  log(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
