import { Network } from '@axe/core/network/network';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { TextNote } from '@axe/domain/tabletop/text-note';
import { buildDisclosureContextMenu } from '@axe/features/disclosure/disclosure-context-menu';

const t = (key: string) => key;

function setMe(userId: string, role: PeerRole) {
  PeerCursor.myCursor = { userId, role, name: userId, isGameMaster: role === PeerRole.GameMaster } as PeerCursor;
}

function obj(owner = '') {
  return { disclosureMode: 'all', disclosureUserIds: [] as string[], owner, update: () => undefined };
}

type Entry = { name?: string; subActions?: { name: string; action: () => void }[]; action?: () => void };

function find(menu: ReturnType<typeof buildDisclosureContextMenu>, fragment: string): Entry | undefined {
  return menu.find((m) => 'name' in m && typeof m.name === 'string' && m.name.includes(fragment)) as Entry | undefined;
}

describe('buildDisclosureContextMenu', () => {
  const original = PeerCursor.myCursor;

  afterEach(() => {
    PeerCursor.myCursor = original;
    vi.restoreAllMocks();
  });

  it('offers a player ownership of an unowned character, but not who may see it', () => {
    setMe('p1', PeerRole.Player);
    const menu = buildDisclosureContextMenu(obj(''), t);
    expect(find(menu, 'feature.disclosure.owner')).toBeTruthy();
    expect(find(menu, 'feature.disclosure.label')).toBeFalsy();
  });

  it('offers a player no ownership of an unowned note a room server keeps for the game master, but of a character', () => {
    vi.spyOn(Network.instance, 'authorityPeerId', 'get').mockReturnValue('@authority');
    setMe('p1', PeerRole.Player);
    const note = TextNote.create('メモ', '本文');
    note.disclosureMode = 'gm';
    try {
      expect(buildDisclosureContextMenu(note, t)).toEqual([]);
      expect(
        find(buildDisclosureContextMenu({ ...obj(''), disclosureMode: 'gm' }, t), 'feature.disclosure.owner')
      ).toBeTruthy();
    } finally {
      note.destroy();
    }
  });

  it('offers a player among peers ownership of an unowned memo kept for the game master, as before', () => {
    vi.spyOn(Network.instance, 'authorityPeerId', 'get').mockReturnValue(null);
    setMe('p1', PeerRole.Player);
    expect(
      find(buildDisclosureContextMenu({ ...obj(''), disclosureMode: 'gm' }, t), 'feature.disclosure.owner')
    ).toBeTruthy();
  });

  it('offers a player on a room server only themselves for a note nobody owns, and everyone for a character', () => {
    vi.spyOn(Network.instance, 'authorityPeerId', 'get').mockReturnValue('@authority');
    vi.spyOn(Network.instance, 'peerContexts', 'get').mockReturnValue([{ peerId: 'peer-2' }] as never);
    vi.spyOn(PeerCursor, 'findByPeerId').mockReturnValue({
      userId: 'acct_p2',
      name: 'p2',
      isMine: false,
    } as PeerCursor);
    setMe('p1', PeerRole.Player);
    const note = TextNote.create('メモ', '本文');
    const choices = (object: Parameters<typeof buildDisclosureContextMenu>[0]) =>
      find(buildDisclosureContextMenu(object, t), 'feature.disclosure.owner')?.subActions?.map((s) => s.name);
    try {
      expect(choices(note)).toEqual(['☑ feature.disclosure.ownerNone', '☐ p1']);
      expect(choices(obj(''))).toEqual(['☑ feature.disclosure.ownerNone', '☐ p1', '☐ p2']);
    } finally {
      note.destroy();
    }
  });

  it('offers on a room server neither to show nor to hand a thing to a seat not logged in, whose id anybody may take', () => {
    vi.spyOn(Network.instance, 'authorityPeerId', 'get').mockReturnValue('@authority');
    vi.spyOn(Network.instance, 'peerContexts', 'get').mockReturnValue([{ peerId: 'peer-2' }] as never);
    vi.spyOn(PeerCursor, 'findByPeerId').mockReturnValue({
      userId: 'guest-tab',
      name: 'g',
      role: PeerRole.Guest,
      isMine: false,
      isGameMaster: false,
    } as PeerCursor);
    setMe('acct_gm', PeerRole.GameMaster);
    const menu = buildDisclosureContextMenu({ ...obj(''), disclosureMode: 'selected' }, t);
    const names = (fragment: string) => find(menu, fragment)?.subActions?.map((s) => s.name) ?? [];

    expect(names('feature.disclosure.owner').some((name) => name.includes(' g'))).toBe(false);
    expect(names('feature.disclosure.label').some((name) => name.includes(' g'))).toBe(false);
  });

  it('keeps offering on a room server a seat not logged in that is already chosen, so that it can be taken off', () => {
    vi.spyOn(Network.instance, 'authorityPeerId', 'get').mockReturnValue('@authority');
    vi.spyOn(Network.instance, 'peerContexts', 'get').mockReturnValue([{ peerId: 'peer-2' }] as never);
    vi.spyOn(PeerCursor, 'findByPeerId').mockReturnValue({
      userId: 'old-account',
      name: 'o',
      role: PeerRole.Guest,
      isMine: false,
      isGameMaster: false,
    } as PeerCursor);
    setMe('acct_gm', PeerRole.GameMaster);
    const chosen = { ...obj('old-account'), disclosureMode: 'selected', disclosureUserIds: ['old-account'] };
    const menu = buildDisclosureContextMenu(chosen, t);
    const names = (fragment: string) => find(menu, fragment)?.subActions?.map((s) => s.name) ?? [];
    const audience = find(menu, 'feature.disclosure.label')?.subActions?.find((s) => s.name.includes('selected'));

    expect(names('feature.disclosure.owner')).toContain('☑ o');
    expect((audience as Entry | undefined)?.subActions?.map((s) => s.name)).toEqual(['☑ o']);
  });

  it('says on a room server that nobody logged in is there to choose, when only seats not logged in are', () => {
    vi.spyOn(Network.instance, 'authorityPeerId', 'get').mockReturnValue('@authority');
    vi.spyOn(Network.instance, 'peerContexts', 'get').mockReturnValue([{ peerId: 'peer-2' }] as never);
    vi.spyOn(PeerCursor, 'findByPeerId').mockReturnValue({
      userId: 'guest-tab',
      name: 'g',
      role: PeerRole.Guest,
      isMine: false,
      isGameMaster: false,
    } as PeerCursor);
    setMe('acct_gm', PeerRole.GameMaster);
    const names = JSON.stringify(buildDisclosureContextMenu({ ...obj(''), disclosureMode: 'selected' }, t));

    expect(names).toContain('feature.disclosure.noLoggedInPlayers');
    expect(names).not.toContain('feature.disclosure.noPlayers');
  });

  it('says on a room server that no other player is there, when the only one left out is the game master', () => {
    vi.spyOn(Network.instance, 'authorityPeerId', 'get').mockReturnValue('@authority');
    vi.spyOn(Network.instance, 'peerContexts', 'get').mockReturnValue([{ peerId: 'peer-2' }] as never);
    vi.spyOn(PeerCursor, 'findByPeerId').mockReturnValue({
      userId: 'acct_gm',
      name: 'gm',
      role: PeerRole.GameMaster,
      isMine: false,
      isGameMaster: true,
    } as PeerCursor);
    setMe('acct_pl', PeerRole.Player);
    const names = JSON.stringify(buildDisclosureContextMenu({ ...obj('acct_pl'), disclosureMode: 'selected' }, t));

    expect(names).toContain('feature.disclosure.noPlayers');
    expect(names).not.toContain('feature.disclosure.noLoggedInPlayers');
  });

  it('offers among peers a seat by whatever id it has', () => {
    vi.spyOn(Network.instance, 'authorityPeerId', 'get').mockReturnValue(null);
    vi.spyOn(Network.instance, 'peerContexts', 'get').mockReturnValue([{ peerId: 'peer-2' }] as never);
    vi.spyOn(PeerCursor, 'findByPeerId').mockReturnValue({
      userId: 'guest-tab',
      name: 'g',
      isMine: false,
      isGameMaster: false,
    } as PeerCursor);
    setMe('gm', PeerRole.GameMaster);
    const menu = buildDisclosureContextMenu({ ...obj(''), disclosureMode: 'selected' }, t);

    expect(find(menu, 'feature.disclosure.owner')?.subActions?.some((s) => s.name.includes(' g'))).toBe(true);
  });

  it('offers a player nothing on somebody elses character', () => {
    setMe('p1', PeerRole.Player);
    expect(buildDisclosureContextMenu(obj('p2'), t)).toEqual([]);
  });

  it('lets the owner set who may see it, without offering ownership', () => {
    setMe('p1', PeerRole.Player);
    const menu = buildDisclosureContextMenu(obj('p1'), t);
    expect(find(menu, 'feature.disclosure.label')).toBeTruthy();
    expect(find(menu, 'feature.disclosure.owner')).toBeFalsy();
  });

  it('offers a guest left owning a piece nothing of it, a guest writing no piece', () => {
    setMe('g1', PeerRole.Guest);
    expect(buildDisclosureContextMenu(obj('g1'), t)).toEqual([]);
  });

  it('offers a guest no ownership even of an unowned character', () => {
    setMe('g1', PeerRole.Guest);
    expect(buildDisclosureContextMenu(obj(''), t)).toEqual([]);
  });

  it('offers the game master both', () => {
    setMe('gm', PeerRole.GameMaster);
    const menu = buildDisclosureContextMenu(obj('p2'), t);
    expect(find(menu, 'feature.disclosure.label')).toBeTruthy();
    expect(find(menu, 'feature.disclosure.owner')).toBeTruthy();
  });

  it('lets a player take an unowned character', () => {
    setMe('p1', PeerRole.Player);
    const o = obj('');
    const ownerMenu = find(buildDisclosureContextMenu(o, t), 'feature.disclosure.owner');
    const mine = ownerMenu?.subActions?.find((s) => s.name.includes('p1'));
    expect(mine).toBeTruthy();
    mine!.action();
    expect(o.owner).toBe('p1');
  });
});
