import { AGENT_BRIDGE_PORT } from '@axe/core/agent/agent-protocol';

import { DEFAULT_ORIGINS, GM_MAX_USD_DEFAULT, readOptions } from './options';

describe('readOptions', () => {
  it('waits for a tab on the usual port, speaks MCP over standard input and output, and trusts the pages Axe is served from', () => {
    expect(readOptions([], {})).toEqual({
      mode: 'mcp',
      port: AGENT_BRIDGE_PORT,
      http: null,
      origins: DEFAULT_ORIGINS,
      token: null,
      maxUsd: GM_MAX_USD_DEFAULT,
      help: false,
      version: false,
    });
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
