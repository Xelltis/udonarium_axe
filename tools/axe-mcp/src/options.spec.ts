import { AGENT_BRIDGE_PORT } from '@axe/core/agent/agent-protocol';

import { DEFAULT_ORIGINS, readOptions } from './options';

describe('readOptions', () => {
  it('waits for a tab on the usual port, speaks MCP over standard input and output, and trusts the pages Axe is served from', () => {
    expect(readOptions([], {})).toEqual({
      port: AGENT_BRIDGE_PORT,
      http: null,
      origins: DEFAULT_ORIGINS,
      token: null,
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

  it('asks for help or the version', () => {
    expect(readOptions(['--help'], {})).toMatchObject({ help: true });
    expect(readOptions(['-v'], {})).toMatchObject({ version: true });
  });
});
