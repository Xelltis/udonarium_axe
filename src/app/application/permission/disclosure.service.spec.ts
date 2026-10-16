import { DisclosureService } from '@axe/application/permission/disclosure.service';
import { Network } from '@axe/core/network/network';
import { Card } from '@axe/domain/card/card';
import { CardStack } from '@axe/domain/card/card-stack';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { TextNote } from '@axe/domain/tabletop/text-note';

function setMe(userId: string, role: PeerRole) {
  PeerCursor.myCursor = { userId, role, isGameMaster: role === PeerRole.GameMaster } as PeerCursor;
}

describe('DisclosureService', () => {
  const service = new DisclosureService();
  const original = PeerCursor.myCursor;

  afterEach(() => {
    PeerCursor.myCursor = original;
    vi.restoreAllMocks();
  });

  it('lets the GM view and edit anything', () => {
    setMe('gm', PeerRole.GameMaster);
    expect(service.canView({ disclosureMode: 'gm', disclosureUserIds: [] })).toBe(true);
    expect(service.canEdit({})).toBe(true);
  });

  it('hides gm-only objects from players but shows public ones', () => {
    setMe('p1', PeerRole.Player);
    expect(service.canView({ disclosureMode: 'gm', disclosureUserIds: [] })).toBe(false);
    expect(service.canView({ disclosureMode: '', disclosureUserIds: [] })).toBe(true);
    expect(service.canView({ disclosureMode: 'selected', disclosureUserIds: ['p1'] })).toBe(true);
    expect(service.canView({ disclosureMode: 'selected', disclosureUserIds: ['p2'] })).toBe(false);
  });

  it('lets the owner view and edit their own object', () => {
    setMe('p1', PeerRole.Player);
    expect(service.canView({ disclosureMode: 'gm', disclosureUserIds: [], owner: 'p1' })).toBe(true);
    expect(service.canEdit({ owner: 'p1' })).toBe(true);
    expect(service.canEdit({ owner: 'p2' })).toBe(false);
    expect(service.canEdit({})).toBe(false);
  });

  const shown = { disclosureMode: 'all', disclosureUserIds: [] };

  it('lets a player set the owner of an unowned object but not an owned one', () => {
    setMe('p1', PeerRole.Player);
    expect(service.canSetOwner(shown)).toBe(true);
    expect(service.canSetOwner({ ...shown, owner: '' })).toBe(true);
    expect(service.canSetOwner({ ...shown, owner: 'p1' })).toBe(true);
    expect(service.canSetOwner({ ...shown, owner: 'p2' })).toBe(false);
  });

  it('does not let a player take an unowned note a room server keeps for the game master, but anything else', () => {
    vi.spyOn(Network.instance, 'authorityPeerId', 'get').mockReturnValue('@authority');
    setMe('p1', PeerRole.Player);
    const note = TextNote.create('メモ', '本文');
    note.disclosureMode = 'gm';
    try {
      expect(service.canSetOwner(note)).toBe(false);
      expect(service.canSetOwner({ disclosureMode: 'gm', disclosureUserIds: [], owner: '' })).toBe(true);
    } finally {
      note.destroy();
    }
  });

  it('keeps a card in a deck from a player on a room server, its owner seeing the face, and leaves it to the game master', () => {
    vi.spyOn(Network.instance, 'authorityPeerId', 'get').mockReturnValue('@authority');
    const stack = CardStack.create('デッキ');
    const card = Card.create('剣の2', 'front.png', 'back.png');
    stack.putOnBottom(card);
    try {
      setMe('p1', PeerRole.Player);
      expect(service.canSetOwner(card)).toBe(false);

      setMe('gm', PeerRole.GameMaster);
      expect(service.canSetOwner(card)).toBe(true);

      vi.spyOn(Network.instance, 'authorityPeerId', 'get').mockReturnValue(null);
      setMe('p1', PeerRole.Player);
      expect(service.canSetOwner(card)).toBe(true);
    } finally {
      stack.destroy();
    }
  });

  it('lets a player among peers take an unowned object kept for the game master, as before', () => {
    vi.spyOn(Network.instance, 'authorityPeerId', 'get').mockReturnValue(null);
    setMe('p1', PeerRole.Player);
    expect(service.canSetOwner({ disclosureMode: 'gm', disclosureUserIds: [], owner: '' })).toBe(true);
  });

  it('lets a guest left owning an object change neither who sees it nor who owns it', () => {
    setMe('g1', PeerRole.Guest);
    const owned = { disclosureMode: 'all', disclosureUserIds: [], owner: 'g1' };
    expect(service.canEdit(owned)).toBe(false);
    expect(service.canSetOwner(owned)).toBe(false);
  });

  it('does not let a guest set the owner of an unowned object', () => {
    setMe('g1', PeerRole.Guest);
    expect(service.canSetOwner(shown)).toBe(false);
  });

  it('requires an identity to claim an unowned object', () => {
    setMe('', PeerRole.Player);
    expect(service.canSetOwner(shown)).toBe(false);
  });

  it('lets the GM set the owner of any object', () => {
    setMe('gm', PeerRole.GameMaster);
    expect(service.canSetOwner({ ...shown, disclosureMode: 'gm' })).toBe(true);
    expect(service.canSetOwner({ ...shown, owner: 'p2' })).toBe(true);
  });
});
