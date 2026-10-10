import { TestBed } from '@angular/core/testing';
import { CharacterDiceService } from '@axe/application/dice/character-dice.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { heldDiceOf, storeHeldDie } from '@axe/domain/character/character-dice';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DiceSymbol, DiceType } from '@axe/domain/dice/dice-symbol';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('CharacterDiceService', () => {
  let service: CharacterDiceService;
  const created: { destroy(): void }[] = [];

  function makeCharacter(): GameCharacter {
    const character = GameCharacter.create('ゴブリンA', 1, '');
    character.location.name = 'table';
    character.location.x = 300;
    character.location.y = 200;
    created.push(character);
    return character;
  }

  function makeSymbol(name = 'ダイス', type = DiceType.D6): DiceSymbol {
    const symbol = DiceSymbol.create(name, type, 1);
    symbol.location.name = 'table';
    created.push(symbol);
    return symbol;
  }

  function deployed(): DiceSymbol[] {
    return ObjectStore.instance
      .getObjects<DiceSymbol>(DiceSymbol)
      .filter((symbol) => symbol.location.name === 'table' && symbol.ownerCharacterIdentifier.length > 0);
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    service = TestBed.inject(CharacterDiceService);
  });

  afterEach(() => {
    for (const symbol of ObjectStore.instance.getObjects<DiceSymbol>(DiceSymbol)) symbol.destroy();
    for (const object of created.splice(0)) object.destroy();
  });

  it('lays nothing out for a character that keeps none', () => {
    expect(service.deploy(makeCharacter())).toEqual([]);
  });

  it('lays out one die for each one kept', () => {
    const character = makeCharacter();
    storeHeldDie(character, { name: '攻撃ダイス', count: 3, faces: [{ label: '1', imageIdentifier: '' }] });

    const laid = service.deploy(character);

    expect(laid).toHaveLength(3);
    expect(deployed()).toHaveLength(3);
  });

  it('takes back every die of that character on the table', () => {
    const character = makeCharacter();
    storeHeldDie(character, { name: '攻撃ダイス', count: 2, faces: [{ label: '1', imageIdentifier: '' }] });
    service.deploy(character);
    const stranger = makeSymbol('よその出目');

    expect(service.laidOut(character)).toHaveLength(2);
    expect(service.putAway(character)).toBe(2);

    expect(service.laidOut(character)).toHaveLength(0);
    expect(heldDiceOf(character)[0].count).toBe(2);
    expect(ObjectStore.instance.get(stranger.identifier)).toBe(stranger);
  });

  it('takes back nothing where the character has laid none out', () => {
    expect(service.putAway(makeCharacter())).toBe(0);
  });

  it('gives each one the faces it was kept with', () => {
    const character = makeCharacter();
    storeHeldDie(character, {
      name: '攻撃ダイス',
      count: 1,
      faces: [
        { label: '目', imageIdentifier: 'picture-eye' },
        { label: '骨', imageIdentifier: 'picture-bone' },
      ],
    });

    const [die] = service.deploy(character);

    expect(die.faces).toEqual(['目', '骨']);
    expect(die.imageDataElement?.getFirstElementByName('骨')?.value).toBe('picture-bone');
    expect(die.face).toBe('目');
  });

  it('lays them beside the piece rather than under it', () => {
    const character = makeCharacter();
    storeHeldDie(character, { name: 'ダイス', count: 2, faces: [{ label: '1', imageIdentifier: '' }] });

    const [first, second] = service.deploy(character);

    expect(first.location.x).toBeGreaterThan(character.location.x);
    expect(second.location.x).toBeGreaterThan(first.location.x);
    expect(first.location.y).toBeGreaterThan(character.location.y);
  });

  it('gives each to the piece that laid it out', () => {
    // Which is what a chat roll written against that name reaches.
    const character = makeCharacter();
    storeHeldDie(character, { name: 'ダイス', count: 1, faces: [{ label: '1', imageIdentifier: '' }] });

    const [die] = service.deploy(character);

    expect(die.ownerCharacterIdentifier).toBe(character.identifier);
  });

  it('puts a die on the table onto the sheet', () => {
    const character = makeCharacter();
    const symbol = makeSymbol('攻撃ダイス');

    service.store(character, symbol);

    expect(heldDiceOf(character).map((die) => die.name)).toEqual(['攻撃ダイス']);
  });

  it('takes the die itself off the table when it does', () => {
    // What is kept is the die as data, and leaving the object behind would put it in two places.
    const character = makeCharacter();
    const symbol = makeSymbol();

    service.store(character, symbol);

    expect(ObjectStore.instance.get(symbol.identifier)).toBeNull();
  });

  it('leaves a die the sheet could not keep on the table', () => {
    const character = makeCharacter();
    const symbol = makeSymbol();
    for (const face of [...(symbol.imageDataElement?.children ?? [])]) face.destroy();

    service.store(character, symbol);

    expect(ObjectStore.instance.get(symbol.identifier)).toBe(symbol);
    expect(service.held(character)).toEqual([]);
  });

  it('reads back what a character keeps', () => {
    const character = makeCharacter();
    storeHeldDie(character, { name: 'ダイス', count: 2, faces: [{ label: '1', imageIdentifier: '' }] });

    expect(service.held(character)).toEqual([
      { name: 'ダイス', count: 2, faces: [{ label: '1', imageIdentifier: '' }], shown: [] },
    ]);
  });

  describe('the face each one was left on', () => {
    it('records what a die was showing as it is put away', () => {
      const character = makeCharacter();
      const symbol = makeSymbol();
      symbol.face = '4';

      service.store(character, symbol);

      expect(service.held(character)[0].shown).toEqual(['4']);
    });

    it('lays each one out on the face it was left on', () => {
      const character = makeCharacter();
      const first = makeSymbol('攻撃ダイス');
      first.face = '2';
      const second = makeSymbol('攻撃ダイス');
      second.face = '6';
      service.store(character, first);
      service.store(character, second);

      const laid = service.deploy(character);

      expect(laid.map((die) => die.face)).toEqual(['2', '6']);
    });

    it('lays a die that was kept to its owner out on its first face', () => {
      const character = makeCharacter();
      const symbol = makeSymbol('隠しダイス');
      symbol.face = '6';
      symbol.owner = 'somebody';
      service.store(character, symbol);

      const [die] = service.deploy(character);

      expect(die.face).toBe('1');
    });

    it('falls back to the first face for one it no longer has', () => {
      const character = makeCharacter();
      storeHeldDie(character, {
        name: 'ダイス',
        count: 1,
        faces: [{ label: '1', imageIdentifier: '' }],
        shown: ['99'],
      });

      const [die] = service.deploy(character);

      expect(die.face).toBe('1');
    });
  });

  describe('laying out takes them off the sheet', () => {
    it('keeps none once they are on the table', () => {
      const character = makeCharacter();
      storeHeldDie(character, { name: 'ダイス', count: 2, faces: [{ label: '1', imageIdentifier: '' }] });

      service.deploy(character);

      expect(service.held(character)).toEqual([]);
    });

    it('lays out nothing on a second press', () => {
      // A die is on the table or kept, never both, or every press would make a fresh set.
      const character = makeCharacter();
      storeHeldDie(character, { name: 'ダイス', count: 2, faces: [{ label: '1', imageIdentifier: '' }] });

      service.deploy(character);
      const again = service.deploy(character);

      expect(again).toEqual([]);
      expect(deployed()).toHaveLength(2);
    });

    it('puts them back when they are put away again', () => {
      const character = makeCharacter();
      storeHeldDie(character, { name: 'ダイス', count: 1, faces: [{ label: '1', imageIdentifier: '' }] });

      const [die] = service.deploy(character);
      service.store(character, die);

      expect(service.held(character).map((held) => held.count)).toEqual([1]);
    });
  });
});
