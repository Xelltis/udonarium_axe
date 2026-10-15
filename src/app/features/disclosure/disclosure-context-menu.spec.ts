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
  });

  it('offers a player ownership of an unowned character, but not who may see it', () => {
    setMe('p1', PeerRole.Player);
    const menu = buildDisclosureContextMenu(obj(''), t);
    expect(find(menu, 'feature.disclosure.owner')).toBeTruthy();
    expect(find(menu, 'feature.disclosure.label')).toBeFalsy();
  });

  it('offers a player no ownership of an unowned memo kept for the game master', () => {
    setMe('p1', PeerRole.Player);
    expect(buildDisclosureContextMenu({ ...obj(''), disclosureMode: 'gm' }, t)).toEqual([]);
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
