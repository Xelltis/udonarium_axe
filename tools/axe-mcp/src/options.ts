import { AGENT_BRIDGE_PORT, AGENT_TRUSTED_ORIGINS, type BridgeMode } from '@axe/core/agent/agent-protocol';

/** The pages of Axe a tab may connect from unless told more. */
export const DEFAULT_ORIGINS: readonly string[] = AGENT_TRUSTED_ORIGINS;

/** How the bridge was asked to run. */
export interface BridgeOptions {
  /** Whether it hands an AI app's calls on (`mcp`), or runs the game master itself (`gm`). */
  readonly mode: BridgeMode;
  /** The port a tab connects on. */
  readonly port: number;
  /** The port an MCP client connects on over HTTP, or null to speak MCP over standard input and output. */
  readonly http: number | null;
  /** The pages a tab may connect from. */
  readonly origins: readonly string[];
  /** What an MCP client over HTTP must show as a bearer token, or null for none. */
  readonly token: string | null;
  readonly help: boolean;
  readonly version: boolean;
}

export const USAGE = `Usage: node axe-mcp.mjs [options]
       node axe-mcp.mjs gm [options]

Lets an AI use a tab of Udonarium Axe through the Model Context Protocol.
Open Axe, press "Connect" in its AI link panel, and the AI's tools act through that seat.

With gm, the bridge runs Claude as the game master itself, through the Claude API, instead of
speaking MCP. Set ANTHROPIC_API_KEY to the key it uses; the key stays in this program and never
reaches Axe. Start and stop the game master from the AI game master panel of Axe.

Options:
  --port <port>          Port the Axe tab connects to (default ${AGENT_BRIDGE_PORT})
  --http <port>          Serve MCP over HTTP on 127.0.0.1:<port>/mcp instead of standard input and output
  --allow-origin <url>   Also accept a tab from this page, such as https://example.com (repeatable)
  --help                 Show this help
  --version              Show the version

Environment:
  AXE_MCP_ALLOW_ORIGINS  More pages to accept a tab from, separated by commas
  AXE_MCP_TOKEN          With --http, the bearer token an MCP client must send
  ANTHROPIC_API_KEY      With gm, the Claude API key the game master is run with`;

function portOf(text: string | undefined, flag: string): number | string {
  const port = Number(text);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : `${flag} needs a port from 1 to 65535`;
}

function originOf(text: string): string | null {
  try {
    const url = new URL(text);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null;
  } catch {
    return null;
  }
}

/** The options the bridge was started with, or what is wrong with them. */
export function readOptions(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>
): BridgeOptions | { error: string } {
  let port = AGENT_BRIDGE_PORT;
  let http: number | null = null;
  let mode: BridgeMode = 'mcp';
  const origins = new Set(DEFAULT_ORIGINS);
  let help = false;
  let version = false;
  const extra = (env['AXE_MCP_ALLOW_ORIGINS'] ?? '')
    .split(',')
    .map((text) => text.trim())
    .filter((text) => text !== '');
  for (const text of extra) {
    const origin = originOf(text);
    if (!origin) return { error: `AXE_MCP_ALLOW_ORIGINS has a page that is not a web address: ${text}` };
    origins.add(origin);
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (i === 0 && arg === 'gm') {
      mode = 'gm';
      continue;
    }
    switch (arg) {
      case '--port':
      case '--http': {
        const read = portOf(argv[++i], arg);
        if (typeof read === 'string') return { error: read };
        if (arg === '--port') port = read;
        else http = read;
        break;
      }
      case '--allow-origin': {
        const origin = originOf(argv[++i] ?? '');
        if (!origin) return { error: '--allow-origin needs a web address, such as https://example.com' };
        origins.add(origin);
        break;
      }
      case '--help':
      case '-h':
        help = true;
        break;
      case '--version':
      case '-v':
        version = true;
        break;
      default:
        return { error: `Unknown option: ${arg}` };
    }
  }
  if (http !== null && http === port) return { error: '--http and --port need different ports' };
  if (mode === 'gm' && http !== null)
    return { error: 'gm runs the game master itself and serves no MCP: leave out --http' };
  const token = env['AXE_MCP_TOKEN']?.trim() || null;
  return { mode, port, http, origins: [...origins], token, help, version };
}
