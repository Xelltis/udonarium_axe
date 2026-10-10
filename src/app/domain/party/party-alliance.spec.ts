import { Party } from '@axe/domain/party/party';
import { allianceOf, NO_ALLIANCE } from '@axe/domain/party/party-alliance';

function party(identifier: string, allies = ''): Party {
  const held = new Party(identifier);
  held.allies = allies;
  return held;
}

describe('which of a room’s parties stand together', () => {
  it('stands nobody with anybody where nobody has said so', () => {
    const allied = allianceOf([party('a'), party('b')]);

    expect(allied('a', 'b')).toBe(false);
    expect(allied).toBe(NO_ALLIANCE);
  });

  it('stands two together on one of them saying so', () => {
    const allied = allianceOf([party('a', 'b'), party('b')]);

    expect(allied('a', 'b')).toBe(true);
    expect(allied('b', 'a')).toBe(true);
  });

  it('leaves a third party out of it', () => {
    const allied = allianceOf([party('a', 'b'), party('b'), party('c')]);

    expect(allied('a', 'c')).toBe(false);
    expect(allied('b', 'c')).toBe(false);
  });

  it('does not make friends of two parties that share one', () => {
    const allied = allianceOf([party('a', 'b'), party('c', 'b'), party('b')]);

    expect(allied('a', 'c')).toBe(false);
  });

  it('pays no heed to a party naming itself, or one that is not there', () => {
    const allied = allianceOf([party('a', 'a gone')]);

    expect(allied('a', 'a')).toBe(false);
    expect(allied('a', 'gone')).toBe(true);
  });
});
