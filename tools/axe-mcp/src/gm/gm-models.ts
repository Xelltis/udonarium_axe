import type { GmModelOffer } from '@axe/core/agent/agent-protocol';

/** What a model costs, in US dollars for a million tokens. */
interface Prices {
  readonly input: number;
  readonly write5m: number;
  readonly write1h: number;
  readonly read: number;
  readonly output: number;
}

/** A model the game master can be run on, with what it costs. */
interface GmModel extends GmModelOffer {
  readonly prices: Prices;
  /** Above this many tokens of prompt a request is charged at the dearer prices, where the model has them. */
  readonly longPrompt?: { readonly over: number; readonly prices: Prices };
}

/** The models offered, best first, at the prices of the pricing page as read on 2026-11-17. */
const GM_MODELS: readonly GmModel[] = [
  {
    id: 'claude-opus-5-5',
    name: 'Claude Opus 5.5',
    prices: { input: 4, write5m: 5, write1h: 8, read: 0.2, output: 20 },
  },
  {
    id: 'claude-sonnet-5-5',
    name: 'Claude Sonnet 5.5',
    prices: { input: 2, write5m: 2.5, write1h: 4, read: 0.1, output: 10 },
  },
  {
    id: 'claude-haiku-5-5',
    name: 'Claude Haiku 5.5',
    prices: { input: 0.1, write5m: 0.125, write1h: 0.2, read: 0.01, output: 0.5 },
    longPrompt: { over: 100_000, prices: { input: 0.5, write5m: 0.625, write1h: 1, read: 0.05, output: 2.5 } },
  },
];

/** The models as the panel offers them. */
export const GM_MODEL_OFFERS: readonly GmModelOffer[] = GM_MODELS.map(({ id, name }) => ({ id, name }));

/** Whether the bridge runs a model. */
export function isGmModel(id: string): boolean {
  return GM_MODELS.some((model) => model.id === id);
}

/** The tokens a response was charged for, as its usage tells them. */
export interface ChargedTokens {
  readonly input_tokens: number;
  readonly output_tokens: number;
  readonly cache_read_input_tokens?: number | null;
  readonly cache_creation_input_tokens?: number | null;
  readonly cache_creation?: {
    readonly ephemeral_5m_input_tokens: number;
    readonly ephemeral_1h_input_tokens: number;
  } | null;
}

/** The whole prompt a response was given: what was read fresh, written to the cache and read from it. */
export function promptTokensOf(usage: ChargedTokens): number {
  return usage.input_tokens + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);
}

/** What a response cost in US dollars, as reckoned from its usage; an unknown model costs nothing reckoned. */
export function costOf(modelId: string, usage: ChargedTokens): number {
  const model = GM_MODELS.find((each) => each.id === modelId);
  if (!model) return 0;
  const prices =
    model.longPrompt && promptTokensOf(usage) > model.longPrompt.over ? model.longPrompt.prices : model.prices;
  const written = usage.cache_creation_input_tokens ?? 0;
  const written1h = usage.cache_creation?.ephemeral_1h_input_tokens ?? 0;
  const written5m = usage.cache_creation ? usage.cache_creation.ephemeral_5m_input_tokens : written;
  const dollars =
    usage.input_tokens * prices.input +
    written5m * prices.write5m +
    written1h * prices.write1h +
    (usage.cache_read_input_tokens ?? 0) * prices.read +
    usage.output_tokens * prices.output;
  return dollars / 1_000_000;
}
