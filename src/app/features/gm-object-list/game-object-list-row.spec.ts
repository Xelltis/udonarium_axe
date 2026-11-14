import { ImageFile } from '@axe/core/storage/image-file';
import { Card } from '@axe/domain/card/card';
import { RangeArea } from '@axe/domain/tabletop/range';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import { Terrain } from '@axe/domain/tabletop/terrain';
import {
  buildObjectRow,
  isDisclosable,
  matchesObjectRowQuery,
  resolveObjectImageUrl,
  resolveRangeThumbnail,
} from '@axe/features/gm-object-list/game-object-list-row';

const makeObject = (props: Record<string, unknown>): TabletopObject =>
  ({
    identifier: 'id-1',
    name: 'Goblin',
    location: { name: 'table', x: 0, y: 0 },
    ...props,
  }) as unknown as TabletopObject;

const noPeer = () => null;

describe('buildObjectRow', () => {
  it('counts an object on the board as on the table', () => {
    const row = buildObjectRow(makeObject({}), 'character', noPeer);
    expect(row.locationKind).toBe('table');
    expect(row.surface).toBe('floor');
    expect(row.name).toBe('Goblin');
  });

  it('counts the graveyard and the shared places', () => {
    expect(buildObjectRow(makeObject({ location: { name: 'graveyard' } }), 'card', noPeer).locationKind).toBe(
      'graveyard'
    );
    expect(buildObjectRow(makeObject({ location: { name: 'common' } }), 'card', noPeer).locationKind).toBe('common');
  });

  it('counts it as somebodys own once the peer resolves, and notes the name', () => {
    const row = buildObjectRow(makeObject({ location: { name: 'peer-xyz' } }), 'character', () => 'Alice');
    expect(row.locationKind).toBe('personal');
    expect(row.locationDetail).toBe('Alice');
  });

  it('counts a place it does not know as somewhere else', () => {
    expect(buildObjectRow(makeObject({ location: { name: 'stack-1' } }), 'card', noPeer).locationKind).toBe('other');
  });

  it('marks only the types that carry a disclosure setting as disclosable', () => {
    const owned = buildObjectRow(makeObject({ disclosureMode: 'gm', disclosureUserIds: [] }), 'character', noPeer);
    expect(owned.disclosable).toBe(true);
    expect(owned.disclosureMode).toBe('gm');

    const terrain = buildObjectRow(makeObject({ isLocked: true }), 'terrain', noPeer);
    expect(terrain.disclosable).toBe(false);
    expect(terrain.disclosureMode).toBe('');
  });

  it('reads the lock of terrain off its own field and everything else off theirs', () => {
    expect(buildObjectRow(makeObject({ isLocked: true }), 'terrain', noPeer).isLock).toBe(true);
    expect(buildObjectRow(makeObject({ isLock: true }), 'card', noPeer).isLock).toBe(true);
  });

  it('reads hiding from the list as hidden', () => {
    expect(buildObjectRow(makeObject({ hideInventory: true }), 'character', noPeer).isHidden).toBe(true);
    expect(buildObjectRow(makeObject({}), 'character', noPeer).isHidden).toBe(false);
  });

  it('takes the picture from whatever suits the kind', () => {
    const row = buildObjectRow(makeObject({ imageFile: { url: 'token.png' } }), 'character', noPeer);
    expect(row.imageUrl).toBe('token.png');
  });
});

describe('resolveObjectImageUrl', () => {
  const made: { destroy(): void }[] = [];
  const picture = (url: string) => ({ url }) as ImageFile;

  function withPictures<T extends TabletopObject>(object: T, pictures: Record<string, unknown>): T {
    made.push(object);
    for (const [name, value] of Object.entries(pictures)) Object.defineProperty(object, name, { value });
    return object;
  }

  afterEach(() => {
    for (const each of made.splice(0)) each.destroy();
  });

  it('takes a characters piece picture', () => {
    expect(resolveObjectImageUrl(makeObject({ imageFile: { url: 'token.png' } }), 'character')).toBe('token.png');
  });

  it('takes the face of a card rather than its back', () => {
    const card = withPictures(Card.create('card', 'front', 'back'), {
      frontImage: picture('front.png'),
      imageFile: picture('back.png'),
    });
    expect(resolveObjectImageUrl(card, 'card')).toBe('front.png');
  });

  it('takes the wall of terrain that has one and the floor otherwise', () => {
    const walled = withPictures(Terrain.create('wall', 1, 1, 1, 'w', 'f'), {
      hasWall: true,
      wallImage: picture('w.png'),
      floorImage: picture('f.png'),
    });
    const flat = withPictures(Terrain.create('floor', 1, 1, 1, '', 'f'), {
      hasWall: false,
      wallImage: null,
      floorImage: picture('f.png'),
    });

    expect(resolveObjectImageUrl(walled, 'terrain')).toBe('w.png');
    expect(resolveObjectImageUrl(flat, 'terrain')).toBe('f.png');
  });

  it('returns nothing for another kind or no picture at all', () => {
    expect(resolveObjectImageUrl(makeObject({ imageFile: { url: 'x.png' } }), 'text-note')).toBe('');
    expect(resolveObjectImageUrl(makeObject({}), 'character')).toBe('');
  });
});

describe('resolveRangeThumbnail', () => {
  const made: RangeArea[] = [];

  afterEach(() => {
    for (const each of made.splice(0)) each.destroy();
  });

  function range(type: string, cellPattern: string): RangeArea {
    const object = RangeArea.create('range', 1, 1, 100);
    object.type = type;
    object.cellPattern = cellPattern;
    object.customGridType = 'square';
    object.gridColor = '#FF0000';
    made.push(object);
    return object;
  }

  it('returns a thumbnail for a custom shape that has a pattern', () => {
    const thumb = resolveRangeThumbnail(range('CUSTOM', '0,0;1,0;0,1'));
    expect(thumb).not.toBeNull();
    expect(thumb!.cells.length).toBe(3);
    expect(thumb!.gridColor).toBe('#FF0000');
  });

  it('returns nothing for a built-in shape, one without a pattern, or anything that is no range', () => {
    expect(resolveRangeThumbnail(range('CORN', '0,0'))).toBeNull();
    expect(resolveRangeThumbnail(range('CUSTOM', ''))).toBeNull();
    expect(resolveRangeThumbnail(makeObject({ type: 'CUSTOM', cellPattern: '0,0' }))).toBeNull();
  });
});

describe('isDisclosable', () => {
  it('is true only for a kind that carries a disclosure setting', () => {
    expect(isDisclosable(makeObject({ disclosureMode: 'gm', disclosureUserIds: [] }))).toBe(true);
    expect(isDisclosable(makeObject({ isLocked: true }))).toBe(false);
  });
});

describe('matchesObjectRowQuery', () => {
  const row = buildObjectRow(makeObject({ name: 'Goblin', ownerName: 'Alice', hasOwner: true }), 'character', noPeer);

  it('matches everything for an empty search', () => {
    expect(matchesObjectRowQuery(row, '')).toBe(true);
  });

  it('matches part of a name or an owner, whatever the case', () => {
    expect(matchesObjectRowQuery(row, 'gob')).toBe(true);
    expect(matchesObjectRowQuery(row, 'ALICE')).toBe(true);
    expect(matchesObjectRowQuery(row, 'dragon')).toBe(false);
  });
});
