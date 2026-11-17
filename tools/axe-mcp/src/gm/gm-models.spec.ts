import { costOf, gmModelOffers, isGmModel, promptTokensOf } from './gm-models';

describe('the models the game master runs on', () => {
  it('offers the current Opus first, then Sonnet and Haiku', () => {
    expect(gmModelOffers().map((model) => model.id)).toEqual([
      'claude-opus-5-5',
      'claude-sonnet-5-5',
      'claude-haiku-5-5',
    ]);
    expect(isGmModel('claude-sonnet-5-5')).toBe(true);
    expect(isGmModel('gpt')).toBe(false);
  });

  it('reckons a response by what was read fresh, written to the cache for each time, read from it, and written', () => {
    const usage = {
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
      cache_read_input_tokens: 1_000_000,
      cache_creation_input_tokens: 2_000_000,
      cache_creation: { ephemeral_5m_input_tokens: 1_000_000, ephemeral_1h_input_tokens: 1_000_000 },
    };
    expect(costOf('claude-opus-5-5', usage)).toBeCloseTo(4 + 20 + 0.2 + 5 + 8);
    expect(costOf('claude-sonnet-5-5', usage)).toBeCloseTo(2 + 10 + 0.1 + 2.5 + 4);
    expect(costOf('unknown', usage)).toBe(0);
  });

  it('counts a write without its breakdown as written for five minutes', () => {
    expect(
      costOf('claude-opus-5-5', {
        input_tokens: 0,
        output_tokens: 0,
        cache_creation_input_tokens: 1_000_000,
        cache_creation: null,
      })
    ).toBeCloseTo(5);
  });

  it('charges Haiku the dearer prices for a request whose whole prompt is over 100,000 tokens', () => {
    const short = { input_tokens: 10_000, output_tokens: 1_000, cache_read_input_tokens: 90_000 };
    const long = { ...short, cache_read_input_tokens: 90_001 };
    expect(promptTokensOf(long)).toBe(100_001);
    expect(costOf('claude-haiku-5-5', short)).toBeCloseTo((10_000 * 0.1 + 1_000 * 0.5 + 90_000 * 0.01) / 1e6);
    expect(costOf('claude-haiku-5-5', long)).toBeCloseTo((10_000 * 0.5 + 1_000 * 2.5 + 90_001 * 0.05) / 1e6);
  });
});
