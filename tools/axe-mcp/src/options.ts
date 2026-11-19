import {
  AGENT_BRIDGE_PORT,
  AGENT_TRUSTED_ORIGINS,
  type BridgeMode,
  GM_MODEL_NAME_MAX,
} from '@axe/core/agent/agent-protocol';

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
  /** With gm, the most the bridge spends while it runs, in US dollars, whatever a tab asks. */
  readonly maxUsd: number;
  /** With gm, whose models run the game master: Claude's, or those of a provider that speaks the chat completions API. */
  readonly provider: GmProvider;
  /** With another provider, the address its API is served under. */
  readonly baseUrl: string;
  /** With another provider, the models offered, by the names the provider knows them by. */
  readonly models: readonly string[];
  /** With another provider, what its models cost in US dollars for a million tokens, or null where not told. */
  readonly price: { readonly input: number; readonly output: number } | null;
  /** With gm, the most tokens a model with no price uses while the bridge runs. */
  readonly maxTokens: number;
  /**
   * The folder whose files the AI may have the bridge read and write, for taking a picture into the
   * room or saving the room to a file: where the bridge was started unless told otherwise.
   */
  readonly filesDir: string;
  readonly help: boolean;
  readonly version: boolean;
}

/**
 * What the game master may spend while the bridge runs unless told otherwise, in US dollars: a tab sets
 * a budget for each start, but a tab taken over could start again and again, so the bridge holds a
 * limit of its own that no tab can raise.
 */
export const GM_MAX_USD_DEFAULT = 20;

/** Whose models run the game master. */
export type GmProvider = 'claude' | 'openai';

/** Where the chat completions API is looked for unless told otherwise. */
export const OPENAI_BASE_URL_DEFAULT = 'https://api.openai.com/v1';

/**
 * The most tokens a model with no price uses while the bridge runs unless told otherwise: what such a
 * model costs is not known, so its use is held by a count of tokens in place of a sum of dollars.
 */
export const GM_MAX_TOKENS_DEFAULT = 2_000_000;

export const USAGE = `Usage: node axe-mcp.mjs [options]
       node axe-mcp.mjs gm [options]

Lets an AI use a tab of Udonarium Axe through the Model Context Protocol.
Open Axe, press "Connect" in its AI link panel, and the AI's tools act through that seat.

With gm, the bridge runs an AI as the game master itself, through its provider's API, instead of
speaking MCP: Claude unless told otherwise, or with --provider openai any provider that speaks the
chat completions API, a model served on this computer among them. The API key stays in this program
and never reaches Axe. Start and stop the game master from the AI game master panel of Axe.

Options:
  --port <port>          Port the Axe tab connects to (default ${AGENT_BRIDGE_PORT})
  --http <port>          Serve MCP over HTTP on 127.0.0.1:<port>/mcp instead of standard input and output
  --allow-origin <url>   Also accept a tab from this page, such as https://example.com (repeatable)
  --max-usd <dollars>    With gm, the most it spends while it runs, over every start (default ${GM_MAX_USD_DEFAULT})
  --provider <name>      With gm, claude (default) or openai (the chat completions API)
  --base-url <url>       With --provider openai, where the API is served (default ${OPENAI_BASE_URL_DEFAULT})
  --model <name>         With --provider openai, a model to offer, by the provider's name for it (repeatable)
  --price <in>,<out>     With --provider openai, what the models cost in US dollars for a million tokens
                         read and written; without it their use is counted in tokens
  --max-tokens <count>   With gm, the most tokens a model with no price uses while it runs
                         (default ${GM_MAX_TOKENS_DEFAULT})
  --files-dir <folder>   The folder the AI may read files from and save files to (default: where the
                         bridge is started); a path leading out of it is refused
  --help                 Show this help
  --version              Show the version

Environment:
  AXE_MCP_ALLOW_ORIGINS  More pages to accept a tab from, separated by commas
  AXE_MCP_TOKEN          With --http, the bearer token an MCP client must send
  ANTHROPIC_API_KEY      With gm, the Claude API key the game master is run with
  AXE_GM_API_KEY         With --provider openai, the provider's API key; left out for a server that asks none
  AXE_GM_MAX_USD         With gm, the same as --max-usd
  AXE_MCP_FILES_DIR      The same as --files-dir`;

function portOf(text: string | undefined, flag: string): number | string {
  const port = Number(text);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : `${flag} needs a port from 1 to 65535`;
}

function dollarsOf(text: string | undefined, name: string): number | string {
  const dollars = Number(text);
  return text !== undefined && text.trim() !== '' && Number.isFinite(dollars) && dollars > 0
    ? dollars
    : `${name} needs a sum of dollars above 0, such as 20`;
}

/** The address an API is served under, without what follows a question mark, or null for anything else. */
function baseUrlOf(text: string): string | null {
  try {
    const url = new URL(text);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return `${url.origin}${url.pathname}`.replace(/\/+$/, '');
  } catch {
    return null;
  }
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
  let maxUsd = GM_MAX_USD_DEFAULT;
  if (env['AXE_GM_MAX_USD'] !== undefined) {
    const read = dollarsOf(env['AXE_GM_MAX_USD'], 'AXE_GM_MAX_USD');
    if (typeof read === 'string') return { error: read };
    maxUsd = read;
  }
  let provider: GmProvider = 'claude';
  let baseUrl = OPENAI_BASE_URL_DEFAULT;
  const models: string[] = [];
  let price: BridgeOptions['price'] = null;
  let maxTokens = GM_MAX_TOKENS_DEFAULT;
  let filesDir = env['AXE_MCP_FILES_DIR']?.trim() || '.';
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
      case '--max-usd': {
        const read = dollarsOf(argv[++i], '--max-usd');
        if (typeof read === 'string') return { error: read };
        maxUsd = read;
        break;
      }
      case '--provider': {
        const named = argv[++i];
        if (named !== 'claude' && named !== 'openai') return { error: '--provider needs claude or openai' };
        provider = named;
        break;
      }
      case '--base-url': {
        const read = baseUrlOf(argv[++i] ?? '');
        if (!read) return { error: '--base-url needs a web address, such as http://127.0.0.1:11434/v1' };
        baseUrl = read;
        break;
      }
      case '--model': {
        const named = (argv[++i] ?? '').trim();
        if (!named || named.startsWith('--') || named.length > GM_MODEL_NAME_MAX) {
          return { error: `--model needs the name of a model, ${GM_MODEL_NAME_MAX} characters at most` };
        }
        if (!models.includes(named)) models.push(named);
        break;
      }
      case '--price': {
        const [input, output, ...rest] = (argv[++i] ?? '').split(',').map((text) => Number(text));
        const sums = [input, output].every((sum) => sum !== undefined && Number.isFinite(sum) && sum >= 0);
        if (!sums || rest.length > 0) return { error: '--price needs two sums of dollars, such as 2.5,10' };
        price = { input: input!, output: output! };
        break;
      }
      case '--max-tokens': {
        const count = Number(argv[++i]);
        if (!Number.isInteger(count) || count < 1) return { error: '--max-tokens needs a count of tokens above 0' };
        maxTokens = count;
        break;
      }
      case '--files-dir': {
        const folder = argv[++i];
        if (!folder || folder.startsWith('--')) return { error: '--files-dir needs a folder' };
        filesDir = folder;
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
  const asksOpenAi = provider === 'openai';
  if (!asksOpenAi && (models.length > 0 || price !== null || baseUrl !== OPENAI_BASE_URL_DEFAULT)) {
    return { error: '--model, --price and --base-url go with --provider openai' };
  }
  if (asksOpenAi && mode !== 'gm') return { error: '--provider goes with gm' };
  if (asksOpenAi && models.length === 0) {
    return { error: '--provider openai needs a model to offer: add --model and its name' };
  }
  const token = env['AXE_MCP_TOKEN']?.trim() || null;
  return {
    mode,
    port,
    http,
    origins: [...origins],
    token,
    maxUsd,
    provider,
    baseUrl,
    models,
    price,
    maxTokens,
    filesDir,
    help,
    version,
  };
}
