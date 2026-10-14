import { transportOf } from '@axe/core/network/transport';

describe('transportOf', () => {
  it('goes through a room server only when the config says so', () => {
    expect(transportOf({ transport: 'server' })).toBe('server');
  });

  it('stays on SkyWay when the config says nothing', () => {
    expect(transportOf({})).toBe('skyway');
  });

  it('stays on SkyWay for a value it does not know', () => {
    expect(transportOf({ transport: 'Server' })).toBe('skyway');
    expect(transportOf({ transport: 1 })).toBe('skyway');
    expect(transportOf({ transport: null })).toBe('skyway');
  });
});
