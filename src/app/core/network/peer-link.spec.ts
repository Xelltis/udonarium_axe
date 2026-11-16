import { PeerLinkFacts, peerLinkStateOf } from '@axe/core/network/peer-link';

const facts = (over: Partial<PeerLinkFacts>): PeerLinkFacts => ({
  isOpen: false,
  isOpening: false,
  attempts: 0,
  isPastBackoff: false,
  isListedByOpenPeer: false,
  ...over,
});

describe('peerLinkStateOf', () => {
  it('is direct while the stream is open, whatever else is known', () => {
    expect(peerLinkStateOf(facts({ isOpen: true }))).toBe('direct');
    expect(peerLinkStateOf(facts({ isOpen: true, attempts: 3, isListedByOpenPeer: true }))).toBe('direct');
  });

  it('is reconnecting while a first stream is on its way to opening', () => {
    expect(peerLinkStateOf(facts({ isOpening: true }))).toBe('reconnecting');
  });

  it('is reconnecting through the attempts of the backoff, with or without a stream just now', () => {
    expect(peerLinkStateOf(facts({ attempts: 1 }))).toBe('reconnecting');
    expect(peerLinkStateOf(facts({ attempts: 5, isOpening: true }))).toBe('reconnecting');
  });

  it('is reconnecting through the backoff even when somebody connected lists the peer', () => {
    expect(peerLinkStateOf(facts({ attempts: 2, isListedByOpenPeer: true }))).toBe('reconnecting');
  });

  it('is failed once the backoff is used up and nobody connected lists the peer', () => {
    expect(peerLinkStateOf(facts({ attempts: 6, isPastBackoff: true }))).toBe('failed');
    expect(peerLinkStateOf(facts({ attempts: 7, isPastBackoff: true, isOpening: true }))).toBe('failed');
  });

  it('is relayed once the backoff is used up while somebody connected lists the peer', () => {
    expect(peerLinkStateOf(facts({ attempts: 6, isPastBackoff: true, isListedByOpenPeer: true }))).toBe('relayed');
  });

  it('is relayed for a peer never dialled that somebody connected lists, and failed for one nobody does', () => {
    expect(peerLinkStateOf(facts({ isListedByOpenPeer: true }))).toBe('relayed');
    expect(peerLinkStateOf(facts({}))).toBe('failed');
  });
});
