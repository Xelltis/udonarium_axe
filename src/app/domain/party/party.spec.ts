import { ObjectSerializer } from '@axe/core/sync/object-serializer';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Party } from '@axe/domain/party/party';

describe('a party in a file', () => {
  afterEach(() => {
    for (const party of ObjectStore.instance.getObjects(Party)) ObjectStore.instance.delete(party, false);
    ObjectStore.instance.clearDeleteHistory();
  });

  function read(xml: string): Party {
    return ObjectSerializer.instance.parseXml(xml) as Party;
  }

  it('writes the side of the battle stage it stands on, and reads it back', () => {
    const party = new Party('party-heroes');
    party.name = '冒険者';
    party.battleSide = 'right';
    const xml = party.toXml();
    ObjectStore.instance.delete(party, false);
    ObjectStore.instance.clearDeleteHistory();

    expect(xml).toContain('battleSide="right"');
    expect(read(xml).battleSide).toBe('right');
  });

  it('writes the players who play it, and reads them back', () => {
    const party = new Party('party-explorers');
    party.players = 'user-a user-b';
    const xml = party.toXml();
    ObjectStore.instance.delete(party, false);
    ObjectStore.instance.clearDeleteHistory();

    expect(read(xml).playerIds).toEqual(['user-a', 'user-b']);
  });

  it('stands a party written before it had a side on neither, played by nobody but its owners', () => {
    const party = read('<party name="冒険者" color="#7dd3fc" allies="" identifier="party-old"></party>');

    expect(party.name).toBe('冒険者');
    expect(party.battleSide).toBe('');
    expect(party.playerIds).toEqual([]);
  });
});
