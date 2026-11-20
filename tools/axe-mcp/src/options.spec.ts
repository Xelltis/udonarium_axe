import { AGENT_BRIDGE_PORT } from '@axe/core/agent/agent-protocol';

import {
  DEFAULT_ORIGINS,
  GM_MAX_TOKENS_DEFAULT,
  GM_MAX_USD_DEFAULT,
  OPENAI_BASE_URL_DEFAULT,
  readOptions,
} from './options';

describe('readOptions', () => {
  it('waits for a tab on the usual port, speaks MCP over standard input and output, and trusts the pages Axe is served from', () => {
    expect(readOptions([], {})).toEqual({
      mode: 'mcp',
      port: AGENT_BRIDGE_PORT,
      http: null,
      origins: DEFAULT_ORIGINS,
      token: null,
      maxUsd: GM_MAX_USD_DEFAULT,
      provider: 'claude',
      baseUrl: OPENAI_BASE_URL_DEFAULT,
      models: [],
      price: null,
      maxTokens: GM_MAX_TOKENS_DEFAULT,
      filesDir: '.',
      help: false,
      version: false,
    });
  });

  it('keeps the files the AI reads and saves to a folder given, by an option or the environment', () => {
    expect(readOptions(['--files-dir', 'sessions'], {})).toMatchObject({ filesDir: 'sessions' });
    expect(readOptions([], { AXE_MCP_FILES_DIR: ' maps ' })).toMatchObject({ filesDir: 'maps' });
    expect(readOptions(['--files-dir'], {})).toEqual({ error: '--files-dir needs a folder' });
  });

  it('runs the game master on another provider’s models, at its address, priced or counted in tokens', () => {
    expect(
      readOptions(
        [
          'gm',
          '--provider',
          'openai',
          '--base-url',
          'http://127.0.0.1:11434/v1/',
          '--model',
          'llama3.3',
          '--model',
          'qwen3',
          '--model',
          'llama3.3',
          '--max-tokens',
          '500000',
        ],
        {}
      )
    ).toMatchObject({
      mode: 'gm',
      provider: 'openai',
      baseUrl: 'http://127.0.0.1:11434/v1',
      models: ['llama3.3', 'qwen3'],
      price: null,
      maxTokens: 500000,
    });
    expect(readOptions(['gm', '--provider', 'openai', '--model', 'gpt-test', '--price', '2.5,10'], {})).toMatchObject({
      baseUrl: OPENAI_BASE_URL_DEFAULT,
      price: { input: 2.5, output: 10 },
    });
  });

  it('says what is wrong with the options of another provider', () => {
    const errorOf = (argv: string[]) => {
      const read = readOptions(argv, {});
      return 'error' in read ? read.error : '';
    };

    expect(errorOf(['gm', '--provider', 'gemini'])).toContain('claude or openai');
    expect(errorOf(['gm', '--provider', 'openai'])).toContain('--model');
    expect(errorOf(['--provider', 'openai', '--model', 'm'])).toContain('goes with gm');
    expect(errorOf(['gm', '--model', 'm'])).toContain('--provider openai');
    expect(errorOf(['gm', '--provider', 'openai', '--model', 'm', '--price', '2'])).toContain('two sums');
    expect(errorOf(['gm', '--provider', 'openai', '--model', 'm', '--base-url', 'ftp://x'])).toContain('web address');
    expect(errorOf(['gm', '--max-tokens', '0'])).toContain('above 0');
  });

  it('takes another port, HTTP, more pages and a token', () => {
    const options = readOptions(['--port', '5000', '--http', '5001', '--allow-origin', 'https://example.com/axe/'], {
      AXE_MCP_ALLOW_ORIGINS: ' https://a.example , http://b.example:8080 ',
      AXE_MCP_TOKEN: ' secret ',
    });
    expect(options).toMatchObject({ port: 5000, http: 5001, token: 'secret' });
    expect('origins' in options && options.origins).toEqual([
      ...DEFAULT_ORIGINS,
      'https://a.example',
      'http://b.example:8080',
      'https://example.com',
    ]);
  });

  it('says what is wrong with options it cannot use', () => {
    expect(readOptions(['--port'], {})).toEqual({ error: '--port needs a port from 1 to 65535' });
    expect(readOptions(['--http', '70000'], {})).toEqual({ error: '--http needs a port from 1 to 65535' });
    expect(readOptions(['--allow-origin', 'file:///x'], {})).toMatchObject({
      error: expect.stringContaining('--allow-origin'),
    });
    expect(readOptions(['--loud'], {})).toEqual({ error: 'Unknown option: --loud' });
    expect(readOptions(['--port', '5000', '--http', '5000'], {})).toEqual({
      error: '--http and --port need different ports',
    });
    expect(readOptions([], { AXE_MCP_ALLOW_ORIGINS: 'nope' })).toMatchObject({
      error: expect.stringContaining('nope'),
    });
  });

  it('runs the game master itself when told gm first, serving no MCP', () => {
    expect(readOptions(['gm', '--port', '5000'], {})).toMatchObject({ mode: 'gm', port: 5000, http: null });
    expect(readOptions(['gm', '--http', '5001'], {})).toMatchObject({ error: expect.stringContaining('--http') });
    expect(readOptions(['--port', '5000', 'gm'], {})).toEqual({ error: 'Unknown option: gm' });
  });

  it('takes what the game master may spend while the bridge runs, from the flag over the environment', () => {
    expect(readOptions(['gm'], { AXE_GM_MAX_USD: '50' })).toMatchObject({ maxUsd: 50 });
    expect(readOptions(['gm', '--max-usd', '7.5'], { AXE_GM_MAX_USD: '50' })).toMatchObject({ maxUsd: 7.5 });
    for (const bad of ['', '0', '-1', 'lots']) {
      expect(readOptions(['gm', '--max-usd', bad], {})).toMatchObject({ error: expect.stringContaining('--max-usd') });
    }
    expect(readOptions(['gm'], { AXE_GM_MAX_USD: '' })).toMatchObject({
      error: expect.stringContaining('AXE_GM_MAX_USD'),
    });
  });

  it('asks for help or the version', () => {
    expect(readOptions(['--help'], {})).toMatchObject({ help: true });
    expect(readOptions(['-v'], {})).toMatchObject({ version: true });
  });
});
