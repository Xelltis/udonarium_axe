import type { GmModelOffer } from '@axe/core/agent/agent-protocol';

/** What a model costs, in US dollars for a million tokens. */
interface Prices {
  readonly input: number;
  readonly write5m: number;
  readonly write1h: number;
  readonly read: number;
  readonly output: number;
}

/** A model the game master can be run on, with what it costs where that is known. */
export interface GmModel extends GmModelOffer {
  /** What it costs, or null for a model whose prices the bridge was not told: its use is counted in tokens. */
  readonly prices: Prices | null;
  /** Above this many tokens of prompt a request is charged at the dearer prices, where the model has them. */
  readonly longPrompt?: { readonly over: number; readonly prices: Prices };
}

/** Claude's models, best first, at the prices of the pricing page as read on 2026-11-17. */
export const CLAUDE_MODELS: readonly GmModel[] = [
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

/** The models the bridge runs: Claude's unless it was started on another provider's. */
let models: readonly GmModel[] = CLAUDE_MODELS;

/** Has the bridge run these models from now on, as the provider it was started on offers them. */
export function useGmModels(offered: readonly GmModel[]): void {
  models = offered;
}

/**
 * A model of a provider the bridge has no table of prices for, by the name the provider knows it by:
 * priced as told when the bridge was started, in US dollars for a million tokens read and written, or
 * not priced at all.
 */
export function namedModel(id: string, price: { readonly input: number; readonly output: number } | null): GmModel {
  const prices = price && {
    input: price.input,
    write5m: price.input,
    write1h: price.input,
    read: price.input,
    output: price.output,
  };
  return { id, name: id, prices };
}

/** The models as the panel offers them. */
export function gmModelOffers(): readonly GmModelOffer[] {
  return models.map(({ id, name }) => ({ id, name }));
}

/** Whether the bridge runs a model. */
export function isGmModel(id: string): boolean {
  return models.some((model) => model.id === id);
}

/** Whether what a model costs is known, so that its use is counted in dollars rather than in tokens. */
export function isPriced(id: string): boolean {
  return models.some((model) => model.id === id && model.prices !== null);
}

/** Whether the bridge knows what none of its models costs, as with a provider it was told no prices for. */
export function noneIsPriced(): boolean {
  return models.every((model) => model.prices === null);
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

/** Every token a response was charged for: the whole prompt and what was written. */
export function tokensOf(usage: ChargedTokens): number {
  return promptTokensOf(usage) + usage.output_tokens;
}

/**
 * What a response cost in US dollars, as reckoned from its usage; a model that is unknown or has no
 * prices costs nothing reckoned, and is held by the tokens it uses instead.
 */
export function costOf(modelId: string, usage: ChargedTokens): number {
  const model = models.find((each) => each.id === modelId);
  if (!model?.prices) return 0;
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
