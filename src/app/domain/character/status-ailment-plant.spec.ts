import { buffKindMarkOf, buffKindOf } from '@axe/domain/character/buff-kind';
import { GameCharacter } from '@axe/domain/character/game-character';
import { newStatusAilment } from '@axe/domain/character/status-ailment';
import { StatusAilmentCatalog } from '@axe/domain/character/status-ailment-catalog';
import { plantStatusAilment } from '@axe/domain/character/status-ailment-plant';
import { applyBuffEdit } from '@axe/domain/data/resource-edit-helpers';

describe('putting a state on a piece marks the buff a debuff (acceptance 2)', () => {
  const poison = { ...newStatusAilment('毒'), effect: '毎R2点' };
  let character: GameCharacter;

  const edit = (command: string) => applyBuffEdit({ command, object: character, targeted: false }, character);

  beforeEach(() => {
    character = GameCharacter.create('テスト戦士', 1, '');
    StatusAilmentCatalog.instance.ailments = [poison];
  });

  afterEach(() => {
    StatusAilmentCatalog.instance.ailments = [];
    character.destroy();
  });

  it('writes the mark when the state is ticked on', () => {
    plantStatusAilment(character, poison);

    expect(buffKindMarkOf(character.buffs.find('毒')!)).toBe('debuff');
  });

  it('writes the mark when a buff command names the state', () => {
    edit('&毒');

    expect(buffKindMarkOf(character.buffs.find('毒')!)).toBe('debuff');
  });

  it('keeps the buff a debuff once the state is taken out of the room’s list', () => {
    plantStatusAilment(character, poison);

    StatusAilmentCatalog.instance.ailments = [];

    expect(buffKindOf(character.buffs.find('毒')!, StatusAilmentCatalog.instance.ailments)).toBe('debuff');
  });

  it('marks it a buff where the command putting the state on says so', () => {
    edit('&毒/薬になる毒/3/バフ');

    expect(buffKindMarkOf(character.buffs.find('毒')!)).toBe('buff');
  });

  it('keeps the mark as the state is piled on and started over', () => {
    edit('&毒');

    edit('&++毒//2');
    expect(buffKindMarkOf(character.buffs.find('毒')!)).toBe('debuff');

    edit('&毒/弱い毒/1');
    expect(buffKindMarkOf(character.buffs.find('毒')!)).toBe('debuff');
  });
});
