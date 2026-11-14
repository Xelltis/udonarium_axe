import { SkyWayDataStream } from '@axe/core/network/skyway/skyway-data-stream';
import { SkyWayDataStreamList } from '@axe/core/network/skyway/skyway-data-stream-list';

describe('SkyWayDataStreamList', () => {
  function createMockStream(peerId: string, open = true, sortKey = '') {
    return {
      peer: { peerId },
      open,
      sortKey,
      removeAllListeners: vi.fn(),
      disconnect: vi.fn(),
    } as unknown as SkyWayDataStream;
  }

  it('starts empty', () => {
    const list = new SkyWayDataStreamList();
    expect(list.length).toBe(0);
  });

  it('adds a stream', () => {
    const list = new SkyWayDataStreamList();
    const stream = createMockStream('peer-1');
    const result = list.add(stream);
    expect(result).toBe(stream);
    expect(list.length).toBe(1);
  });

  it('removes a stream', () => {
    const list = new SkyWayDataStreamList();
    const stream = createMockStream('peer-1');
    list.add(stream);
    const result = list.remove(stream);
    expect(result).toBe(stream);
    expect(list.length).toBe(0);
  });

  it('finds a stream', () => {
    const list = new SkyWayDataStreamList();
    const stream = createMockStream('peer-1');
    list.add(stream);
    expect(list.find('peer-1')).toBe(stream);
    expect(list.find('peer-2')).toBeUndefined();
  });

  it('returns the peer ids in order', () => {
    const list = new SkyWayDataStreamList();
    list.add(createMockStream('peer-c'));
    list.add(createMockStream('peer-a'));
    list.add(createMockStream('peer-b'));
    expect(list.peerIds).toEqual(['peer-a', 'peer-b', 'peer-c']);
  });

  it('returns the peers in order', () => {
    const list = new SkyWayDataStreamList();
    list.add(createMockStream('peer-2'));
    list.add(createMockStream('peer-1'));
    const peers = list.peers;
    expect(peers[0].peerId).toBe('peer-1');
    expect(peers[1].peerId).toBe('peer-2');
  });

  it('returns nothing when adding the same one twice', () => {
    const list = new SkyWayDataStreamList();
    const stream = createMockStream('peer-1', true, 'aaa');
    list.add(stream);
    const result = list.add(stream);
    expect(result).toBeNull();
  });

  describe('a second stream for a peer', () => {
    const held = (list: SkyWayDataStreamList) => list.find('peer-1');

    it('loses to the one held with the lower sort key, as when both peers dial at once', () => {
      const list = new SkyWayDataStreamList();
      const first = createMockStream('peer-1', false, 'aaa');
      const second = createMockStream('peer-1', false, 'bbb');
      list.add(first);

      expect(list.add(second)).toBeNull();
      expect(held(list)).toBe(first);
      expect(second.disconnect).toHaveBeenCalled();
    });

    it('replaces the one held with the higher sort key', () => {
      const list = new SkyWayDataStreamList();
      const first = createMockStream('peer-1', false, 'bbb');
      const second = createMockStream('peer-1', false, 'aaa');
      list.add(first);

      expect(list.add(second)).toBe(second);
      expect(held(list)).toBe(second);
      expect(first.disconnect).toHaveBeenCalled();
    });

    it('replaces one held that has given way, whatever the sort keys', () => {
      const list = new SkyWayDataStreamList();
      const gone = createMockStream('peer-1', false, 'aaa');
      (gone as unknown as { yieldsToNewcomer: boolean }).yieldsToNewcomer = true;
      const fresh = createMockStream('peer-1', false, 'bbb');
      list.add(gone);

      expect(list.add(fresh)).toBe(fresh);
      expect(held(list)).toBe(fresh);
      expect(list.length).toBe(1);
      expect(gone.disconnect).toHaveBeenCalled();
      expect(fresh.disconnect).not.toHaveBeenCalled();
    });
  });

  it('can be iterated', () => {
    const list = new SkyWayDataStreamList();
    list.add(createMockStream('peer-1'));
    list.add(createMockStream('peer-2'));
    const ids: string[] = [];
    for (const stream of list) {
      ids.push(stream.peer.peerId);
    }
    expect(ids).toHaveLength(2);
  });
});
