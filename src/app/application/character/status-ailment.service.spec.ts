import { TestBed } from '@angular/core/testing';
import { StatusAilmentService } from '@axe/application/character/status-ailment.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { buffColorOf, buffIconOf } from '@axe/domain/character/buff-badge';
import { buffTimingOf } from '@axe/domain/character/buff-timing';
import { GameCharacter } from '@axe/domain/character/game-character';
import { newStatusAilment, StatusAilment } from '@axe/domain/character/status-ailment';
import { StatusAilmentCatalog } from '@axe/domain/character/status-ailment-catalog';
import { DataElement } from '@axe/domain/data/data-element';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('StatusAilmentService', () => {
  let service: StatusAilmentService;
  const created: GameCharacter[] = [];

  function character(name: string): GameCharacter {
    const made = GameCharacter.create(name, 1, '');
    created.push(made);
    return made;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    service = TestBed.inject(StatusAilmentService);
    service.save([]);
  });

  afterEach(() => {
    for (const made of created.splice(0)) ObjectStore.instance.remove(made);
    service.save([]);
    (StatusAilmentCatalog as unknown as Record<string, unknown>)['_instance'] = undefined;
  });

  describe('the catalogue', () => {
    it('takes a state and gives it back', () => {
      service.add('毒');

      expect(service.ailments().map((entry) => entry.name)).toEqual(['毒']);
    });

    it('refuses a second state of the same name, which would be a second column', () => {
      service.add('毒');
      service.add('毒');

      expect(service.ailments()).toHaveLength(1);
    });

    it('refuses one with nothing to call it', () => {
      expect(service.add('   ')).toBeNull();
      expect(service.ailments()).toEqual([]);
    });

    it('takes the first word, since a column is asked for by a single word', () => {
      service.add('行動 不能');

      expect(service.ailments()[0].name).toBe('行動');
    });

    it('moves one along the order the columns stand in', () => {
      service.add('毒');
      service.add('麻痺');
      service.add('気絶');

      service.move('気絶', -1);

      expect(service.ailments().map((entry) => entry.name)).toEqual(['毒', '気絶', '麻痺']);
    });

    it('leaves the order alone at either end', () => {
      service.add('毒');
      service.add('麻痺');

      service.move('毒', -1);
      service.move('麻痺', 1);

      expect(service.ailments().map((entry) => entry.name)).toEqual(['毒', '麻痺']);
    });

    it('takes one away', () => {
      service.add('毒');
      service.add('麻痺');

      service.remove('毒');

      expect(service.ailments().map((entry) => entry.name)).toEqual(['麻痺']);
    });
  });

  describe('putting one on a piece', () => {
    it('writes it down as a buff, dressed the way the catalogue says', () => {
      const goblin = character('ゴブリン');
      service.add('毒');
      service.save([{ ...service.ailments()[0], color: 'green', icon: '☠', effect: '毎ラウンド HP-1' }]);

      service.plant(goblin, service.ailments()[0]);

      const buff = goblin.buffs.find('毒')!;
      expect(buff).toBeTruthy();
      expect(buffColorOf(buff)).toBe('green');
      expect(buffIconOf(buff)).toBe('☠');
      expect(`${buff.currentValue}`).toBe('毎ラウンド HP-1');
    });

    it('holds a state with no rounds until it is taken away', () => {
      const goblin = character('ゴブリン');
      service.add('毒');

      service.plant(goblin, service.ailments()[0]);

      expect(buffTimingOf(goblin.buffs.find('毒')!)).toBe('none');
    });

    it('counts a state with rounds down with them', () => {
      const goblin = character('ゴブリン');
      service.add('加護');
      service.save([{ ...service.ailments()[0], rounds: 3, timing: 'roundEnd' }]);

      service.plant(goblin, service.ailments()[0]);

      const buff = goblin.buffs.find('加護')!;
      expect(parseInt(`${buff.value}`)).toBe(3);
      expect(buffTimingOf(buff)).toBe('roundEnd');
    });

    it('puts on a state the piece has nothing of its own for', () => {
      const rock = character('岩');
      service.add('燃焼');

      service.plant(rock, service.ailments()[0]);

      expect(service.isOn(rock, '燃焼')).toBe(true);
    });

    it('leaves one of it, however often it is put on', () => {
      const goblin = character('ゴブリン');
      service.add('毒');

      service.plant(goblin, service.ailments()[0]);
      service.plant(goblin, service.ailments()[0]);

      const container = goblin.buffDataElement!.children[0];
      expect(container.children.filter((buff) => buff.name === '毒')).toHaveLength(1);
    });

    it('takes it off again', () => {
      const goblin = character('ゴブリン');
      service.add('毒');
      service.plant(goblin, service.ailments()[0]);

      service.pull(goblin, '毒');

      expect(service.isOn(goblin, '毒')).toBe(false);
    });

    it('says nothing is on a piece that was never given one', () => {
      expect(service.isOn(character('通行人'), '毒')).toBe(false);
    });

    it('leaves a state already put on where it is when the catalogue drops it', () => {
      const goblin = character('ゴブリン');
      service.add('毒');
      service.plant(goblin, service.ailments()[0]);

      service.remove('毒');

      expect(service.isOn(goblin, '毒')).toBe(true);
    });
  });
});

describe('StatusAilmentService and the statuses a state moves', () => {
  let service: StatusAilmentService;
  const created: GameCharacter[] = [];

  function walker(move: number): GameCharacter {
    const made = GameCharacter.create('歩き手', 1, '');
    DataElement.findElementByReference(made.rootDataElement!, '移動')!.value = move;
    created.push(made);
    return made;
  }

  const moveOf = (piece: GameCharacter) =>
    Number(DataElement.findElementByReference(piece.rootDataElement!, '移動')!.value);

  const binding = (over: Partial<StatusAilment> = {}): StatusAilment => ({
    ...newStatusAilment('拘束'),
    stat: '移動',
    op: '=',
    amount: '0',
    ...over,
  });

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    service = TestBed.inject(StatusAilmentService);
    service.save([]);
  });

  afterEach(() => {
    for (const made of created.splice(0)) ObjectStore.instance.remove(made);
    service.save([]);
    (StatusAilmentCatalog as unknown as Record<string, unknown>)['_instance'] = undefined;
  });

  it('holds the status where the state says while it is worn', () => {
    const piece = walker(8);

    service.plant(piece, binding());

    expect(moveOf(piece)).toBe(0);
  });

  it('gives back exactly what it took when the state comes off', () => {
    const piece = walker(8);
    service.plant(piece, binding());

    service.pull(piece, '拘束');

    expect(moveOf(piece)).toBe(8);
  });

  it('moves a status by an amount where the state asks for that instead', () => {
    const piece = walker(8);

    service.plant(piece, binding({ name: '鈍足', op: '-', amount: '3' }));

    expect(moveOf(piece)).toBe(5);
  });

  it('leaves the sheet alone for a state that names no status', () => {
    const piece = walker(8);

    service.plant(piece, newStatusAilment('毒'));

    expect(moveOf(piece)).toBe(8);
  });

  it('goes on as a plain mark where the sheet has no such status', () => {
    const piece = walker(8);

    service.plant(piece, binding({ stat: '飛行' }));

    expect(service.isOn(piece, '拘束')).toBe(true);
    expect(moveOf(piece)).toBe(8);
  });
});
