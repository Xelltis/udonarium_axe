import { Network } from '@axe/core/network/network';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
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

  it('offers a player no ownership of an unowned memo a room server keeps for the game master', () => {
    vi.spyOn(Network.instance, 'authorityPeerId', 'get').mockReturnValue('@authority');
    setMe('p1', PeerRole.Player);
    expect(buildDisclosureContextMenu({ ...obj(''), disclosureMode: 'gm' }, t)).toEqual([]);
  });

  it('offers a player among peers ownership of an unowned memo kept for the game master, as before', () => {
    vi.spyOn(Network.instance, 'authorityPeerId', 'get').mockReturnValue(null);
    setMe('p1', PeerRole.Player);
    expect(
      find(buildDisclosureContextMenu({ ...obj(''), disclosureMode: 'gm' }, t), 'feature.disclosure.owner')
    ).toBeTruthy();
  });

  it('offers a player on a room server only themselves as the owner of an unowned piece, which is all it takes', () => {
    vi.spyOn(Network.instance, 'authorityPeerId', 'get').mockReturnValue('@authority');
    vi.spyOn(Network.instance, 'peerContexts', 'get').mockReturnValue([{ peerId: 'peer-2' }] as never);
    vi.spyOn(PeerCursor, 'findByPeerId').mockReturnValue({ userId: 'p2', name: 'p2', isMine: false } as PeerCursor);
    setMe('p1', PeerRole.Player);
    const choices = () =>
      find(buildDisclosureContextMenu(obj(''), t), 'feature.disclosure.owner')?.subActions?.map((s) => s.name);

    expect(choices()).toEqual(['☑ feature.disclosure.ownerNone', '☐ p1']);
    vi.spyOn(Network.instance, 'authorityPeerId', 'get').mockReturnValue(null);
    expect(choices()).toEqual(['☑ feature.disclosure.ownerNone', '☐ p1', '☐ p2']);
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
