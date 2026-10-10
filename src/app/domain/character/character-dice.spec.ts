import { ObjectSerializer } from '@axe/core/sync/object-serializer';
import { ObjectStore } from '@axe/core/sync/object-store';
import {
  HELD_DICE_SECTION,
  HELD_DICE_SHOWN,
  heldDiceOf,
  heldDieOfSymbol,
  removeHeldDie,
  storeHeldDie,
  takeHeldDice,
} from '@axe/domain/character/character-dice';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement } from '@axe/domain/data/data-element';
import { DiceSymbol, DiceType } from '@axe/domain/dice/dice-symbol';

describe('the dice a character keeps', () => {
  const created: { destroy(): void }[] = [];

  function makeCharacter(): GameCharacter {
    const character = GameCharacter.create('ゴブリンA', 1, '');
    created.push(character);
    return character;
  }

  function makeSymbol(name = 'ダイス', type = DiceType.D6): DiceSymbol {
    const symbol = DiceSymbol.create(name, type, 1);
    created.push(symbol);
    return symbol;
  }

  afterEach(() => {
    for (const object of created.splice(0)) object.destroy();
  });

  it('keeps none to begin with', () => {
    expect(heldDiceOf(makeCharacter())).toEqual([]);
  });

  it('reads a die off the table with its faces', () => {
    const symbol = makeSymbol('攻撃ダイス');
    symbol.imageDataElement!.getFirstElementByName('1')!.value = 'picture-1';

    const die = heldDieOfSymbol(symbol);

    expect(die.name).toBe('攻撃ダイス');
    expect(die.count).toBe(1);
    expect(die.faces).toHaveLength(6);
    expect(die.faces[0]).toEqual({ label: '1', imageIdentifier: 'picture-1' });
  });

  it('puts one onto the sheet', () => {
    const character = makeCharacter();

    storeHeldDie(character, heldDieOfSymbol(makeSymbol('攻撃ダイス')));

    const [die] = heldDiceOf(character);
    expect(die.name).toBe('攻撃ダイス');
    expect(die.count).toBe(1);
    expect(die.faces.map((face) => face.label)).toEqual(['1', '2', '3', '4', '5', '6']);
  });

  it('keeps the pictures of each face', () => {
    const character = makeCharacter();
    const symbol = makeSymbol();
    symbol.imageDataElement!.getFirstElementByName('3')!.value = 'picture-3';

    storeHeldDie(character, heldDieOfSymbol(symbol));

    const face = heldDiceOf(character)[0].faces.find((entry) => entry.label === '3');
    expect(face?.imageIdentifier).toBe('picture-3');
  });

  it('counts a second die of the same name rather than writing it again', () => {
    // Six identical dice are a count of six, not six groups to read past.
    const character = makeCharacter();

    storeHeldDie(character, heldDieOfSymbol(makeSymbol('攻撃ダイス')));
    storeHeldDie(character, heldDieOfSymbol(makeSymbol('攻撃ダイス')));

    expect(heldDiceOf(character)).toHaveLength(1);
    expect(heldDiceOf(character)[0].count).toBe(2);
  });

  it('keeps a die of another name apart', () => {
    const character = makeCharacter();

    storeHeldDie(character, heldDieOfSymbol(makeSymbol('攻撃ダイス')));
    storeHeldDie(character, heldDieOfSymbol(makeSymbol('守りのダイス', DiceType.D20)));

    expect(heldDiceOf(character).map((die) => die.name)).toEqual(['攻撃ダイス', '守りのダイス']);
    expect(heldDiceOf(character)[1].faces).toHaveLength(20);
  });

  it('keeps a die with no faces off the sheet', () => {
    const character = makeCharacter();

    storeHeldDie(character, { name: '空のダイス', count: 1, faces: [] });

    expect(heldDiceOf(character)).toEqual([]);
  });

  it('says whether the die was kept', () => {
    const character = makeCharacter();

    expect(storeHeldDie(character, heldDieOfSymbol(makeSymbol('攻撃ダイス')))).toBe(true);
    expect(storeHeldDie(character, { name: '空のダイス', count: 1, faces: [] })).toBe(false);
  });

  it('lowers the count when one is taken back', () => {
    const character = makeCharacter();
    storeHeldDie(character, { ...heldDieOfSymbol(makeSymbol('攻撃ダイス')), count: 3 });

    removeHeldDie(character, '攻撃ダイス');

    expect(heldDiceOf(character)[0].count).toBe(2);
  });

  it('takes the last one off the sheet altogether', () => {
    const character = makeCharacter();
    storeHeldDie(character, heldDieOfSymbol(makeSymbol('攻撃ダイス')));

    removeHeldDie(character, '攻撃ダイス');

    expect(heldDiceOf(character)).toEqual([]);
  });

  it('takes nothing back that was never there', () => {
    const character = makeCharacter();
    storeHeldDie(character, heldDieOfSymbol(makeSymbol('攻撃ダイス')));

    removeHeldDie(character, 'だれかのダイス');

    expect(heldDiceOf(character)).toHaveLength(1);
  });

  it('writes them where the sheet can edit them', () => {
    // The section is the sheet's own, so the pictures can be changed there by hand.
    const character = makeCharacter();

    storeHeldDie(character, heldDieOfSymbol(makeSymbol('攻撃ダイス')));

    expect(character.detailDataElement?.getFirstElementByName(HELD_DICE_SECTION)).toBeTruthy();
  });

  it('survives the round trip through the saved data', () => {
    // They are written as the sheet's own elements, so they are saved and read back with it.
    const character = makeCharacter();
    storeHeldDie(character, { ...heldDieOfSymbol(makeSymbol('攻撃ダイス')), count: 2 });
    const section = character.detailDataElement!.getFirstElementByName(HELD_DICE_SECTION)!;
    const xml = ObjectSerializer.instance.toXml(section);
    const expected = heldDiceOf(character);

    section.destroy();
    ObjectStore.instance.clearDeleteHistory();
    const restored = ObjectSerializer.instance.parseXml(xml) as DataElement;
    character.detailDataElement!.appendChild(restored);

    expect(heldDiceOf(character)).toEqual(expected);
  });

  describe('what each die was showing', () => {
    it('records the face it was put away on', () => {
      const character = makeCharacter();
      const symbol = makeSymbol('攻撃ダイス');
      symbol.face = '4';

      storeHeldDie(character, heldDieOfSymbol(symbol));

      expect(heldDiceOf(character)[0].shown).toEqual(['4']);
    });

    it('records one for each die of the same name', () => {
      // A set put away mid-scene comes back out as it was left, die for die.
      const character = makeCharacter();
      const first = makeSymbol('攻撃ダイス');
      first.face = '2';
      const second = makeSymbol('攻撃ダイス');
      second.face = '6';

      storeHeldDie(character, heldDieOfSymbol(first));
      storeHeldDie(character, heldDieOfSymbol(second));

      expect(heldDiceOf(character)[0].shown).toEqual(['2', '6']);
    });

    it('keeps the faces of the ones still there when one is taken back', () => {
      const character = makeCharacter();
      const symbol = makeSymbol('攻撃ダイス');
      symbol.face = '3';
      storeHeldDie(character, { ...heldDieOfSymbol(symbol), count: 3, shown: ['3', '5', '1'] });

      removeHeldDie(character, '攻撃ダイス');

      expect(heldDiceOf(character)[0].shown).toEqual(['3', '5']);
    });

    it('records none for a die that was kept to its owner', () => {
      const character = makeCharacter();
      const symbol = makeSymbol('隠しダイス');
      symbol.face = '6';
      symbol.owner = 'somebody';

      storeHeldDie(character, heldDieOfSymbol(symbol));

      expect(heldDiceOf(character)[0].shown).toEqual([]);
    });

    it('writes nothing where the sheet shows the face of such a die', () => {
      const character = makeCharacter();
      const symbol = makeSymbol('隠しダイス');
      symbol.face = '6';
      symbol.owner = 'somebody';

      storeHeldDie(character, heldDieOfSymbol(symbol));

      const section = character.detailDataElement!.getFirstElementByName(HELD_DICE_SECTION)!;
      expect(section.getFirstElementByName(HELD_DICE_SHOWN)?.value).toBe('');
    });

    it('records none for a die written onto the sheet by hand', () => {
      const character = makeCharacter();

      storeHeldDie(character, { name: '手書き', count: 1, faces: [{ label: '1', imageIdentifier: '' }] });

      expect(heldDiceOf(character)[0].shown).toEqual([]);
    });

    it('writes them where the sheet shows them', () => {
      const character = makeCharacter();
      const symbol = makeSymbol('攻撃ダイス');
      symbol.face = '4';

      storeHeldDie(character, heldDieOfSymbol(symbol));

      const section = character.detailDataElement!.getFirstElementByName(HELD_DICE_SECTION)!;
      expect(section.getFirstElementByName(HELD_DICE_SHOWN)?.value).toBe('4');
    });
  });

  describe('what the save data carries', () => {
    it('writes the pictures where the archive looks for them', () => {
      // The archiver gathers every element marked as an image, so the faces travel with the character.
      const character = makeCharacter();
      const symbol = makeSymbol('攻撃ダイス');
      symbol.imageDataElement!.getFirstElementByName('1')!.value = 'picture-1';
      storeHeldDie(character, heldDieOfSymbol(symbol));

      const xml = character.toXml();

      expect(xml).toContain('type="image"');
      expect(xml).toContain('picture-1');
    });

    it('shows the dice as a table on the sheet', () => {
      // A die reads as one row of faces rather than a field for each.
      const character = makeCharacter();
      storeHeldDie(character, heldDieOfSymbol(makeSymbol('攻撃ダイス')));

      const section = character.detailDataElement!.getFirstElementByName(HELD_DICE_SECTION)!;
      expect(section.viewMode).toBe('table');
    });
  });

  describe('taking them all off the sheet', () => {
    it('hands over what was kept', () => {
      const character = makeCharacter();
      storeHeldDie(character, heldDieOfSymbol(makeSymbol('攻撃ダイス')));

      expect(takeHeldDice(character).map((die) => die.name)).toEqual(['攻撃ダイス']);
    });

    it('leaves the sheet keeping none', () => {
      const character = makeCharacter();
      storeHeldDie(character, heldDieOfSymbol(makeSymbol('攻撃ダイス')));

      takeHeldDice(character);

      expect(heldDiceOf(character)).toEqual([]);
      expect(character.detailDataElement?.getFirstElementByName(HELD_DICE_SECTION)).toBeNull();
    });

    it('hands over nothing from a character that keeps none', () => {
      expect(takeHeldDice(makeCharacter())).toEqual([]);
    });

    it('writes the next set under an identifier of its own', () => {
      // The section that was taken away is one the rest of the table has been told to delete.
      // One arriving under that same identifier is refused there, and the deletion comes back
      // to take this one away as well.
      const character = makeCharacter();
      storeHeldDie(character, heldDieOfSymbol(makeSymbol('攻撃ダイス')));
      const taken = character.detailDataElement!.getFirstElementByName(HELD_DICE_SECTION)!.identifier;

      takeHeldDice(character);
      storeHeldDie(character, heldDieOfSymbol(makeSymbol('攻撃ダイス')));

      const section = character.detailDataElement!.getFirstElementByName(HELD_DICE_SECTION)!;
      expect(section.identifier).not.toBe(taken);
      expect(ObjectStore.instance.isDeleted(section.identifier)).toBe(false);
      expect(heldDiceOf(character).map((die) => die.name)).toEqual(['攻撃ダイス']);
    });
  });
});
