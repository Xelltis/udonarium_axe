import { dataChannelOf, p2pConnectionOf } from '@axe/core/network/skyway/skyway-internals';

describe('p2pConnectionOf', () => {
  it('asks the member for its connection to the person behind the SDK’s adapter, as the member itself', () => {
    const connection = { receiver: {}, sender: {} };
    const impl = { id: 'person-impl' };
    const member = {
      _getOrCreateConnection: vi.fn(function (this: unknown, given: unknown) {
        return this === member && given === impl ? connection : null;
      }),
    };

    expect(p2pConnectionOf(member as never, { _impl: impl } as never)).toBe(connection);
  });

  it('is undefined without a member, or for one the SDK keeps no connection for', () => {
    expect(p2pConnectionOf(undefined, { _impl: {} } as never)).toBeUndefined();
    expect(p2pConnectionOf({} as never, { _impl: {} } as never)).toBeUndefined();
  });

  it('asks with nothing while this seat has no person in the room', () => {
    const member = { _getOrCreateConnection: vi.fn(() => undefined) };

    p2pConnectionOf(member as never, null);

    expect(member._getOrCreateConnection).toHaveBeenCalledWith(undefined);
  });
});

describe('dataChannelOf', () => {
  it('reads the channel under a remote data stream', () => {
    const channel = { readyState: 'open' };

    expect(dataChannelOf({ _datachannel: channel } as never)).toBe(channel);
  });

  it('is undefined without a stream, or for a stream of another kind', () => {
    expect(dataChannelOf(undefined)).toBeUndefined();
    expect(dataChannelOf({ contentType: 'audio' } as never)).toBeUndefined();
  });
});
