import { TestBed } from '@angular/core/testing';
import { ResetUndoService } from '@axe/application/character/reset-undo.service';
import { GameCharacter } from '@axe/domain/character/game-character';
import { resetAcross, type ResetRecord, ResetRecorder } from '@axe/domain/character/piece-reset';
import { DataElement, DataElementAttribute, DataElementFieldType } from '@axe/domain/data/data-element';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('ResetUndoService', () => {
  const originalCursor = PeerCursor.myCursor;
  let service: ResetUndoService;
  let made: GameCharacter[] = [];

  function beSeat(role: PeerRole): void {
    PeerCursor.myCursor = { role, userId: 'me', identifier: 'seat' } as PeerCursor;
  }

  /** A piece whose 命中 keeps 3 as its default and stands at 9, wearing one buff. */
  function piece(name: string): { character: GameCharacter; hit: DataElement } {
    const character = GameCharacter.create(name, 1, '');
    character.addExtendData();
    const hit = DataElement.create('命中', 9, {
      [DataElementAttribute.FIELD_TYPE]: DataElementFieldType.NUMBER,
      [DataElementAttribute.DEFAULT]: '3',
    });
    character.detailDataElement!.children[0].appendChild(hit);
    character.buffs.addRound('盾', '防御+1', 3);
    made.push(character);
    return { character, hit };
  }

  function reset(...pieces: GameCharacter[]): ResetRecord {
    const recorder = new ResetRecorder();
    recorder.watch(pieces);
    resetAcross(pieces, { rule: { kind: 'all' }, values: true });
    return recorder.finish();
  }

  const buffsOf = (character: GameCharacter) => character.buffs.list().map((data) => data.name);

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    service = TestBed.inject(ResetUndoService);
    beSeat(PeerRole.Player);
  });

  afterEach(() => {
    PeerCursor.myCursor = originalCursor;
    for (const character of made) character.destroy();
    made = [];
  });

  it('offers the way back from the line that reported the reset, and from no other line', () => {
    const { character } = piece('騎士');
    service.keep('line-1', reset(character));

    expect(service.isOffered('line-1')).toBe(true);
    expect(service.isOffered('line-2')).toBe(false);
    expect(service.isOffered('')).toBe(false);
  });

  it('puts the buffs and the values back, and tells how it ended on that line', () => {
    const { character, hit } = piece('騎士');
    service.keep('line-1', reset(character));
    expect([hit.value, buffsOf(character)]).toEqual([3, []]);

    expect(service.undo('line-1')).toEqual({ messageIdentifier: 'line-1', restored: 1, skipped: 0 });

    expect([hit.value, buffsOf(character)]).toEqual([9, ['盾']]);
    expect(service.resultOf('line-1')).toEqual({ messageIdentifier: 'line-1', restored: 1, skipped: 0 });
    expect(service.resultOf('line-2')).toBeNull();
  });

  it('can be taken back once: a second press does nothing', () => {
    const { character, hit } = piece('騎士');
    service.keep('line-1', reset(character));
    service.undo('line-1');
    hit.value = 5;

    expect(service.isOffered('line-1')).toBe(false);
    expect(service.undo('line-1')).toBeNull();
    expect(hit.value).toBe(5);
  });

  it('keeps only the latest reset: the next one takes the place of the one before', () => {
    const first = piece('騎士');
    const second = piece('従者');
    service.keep('line-1', reset(first.character));
    service.keep('line-2', reset(second.character));

    expect(service.isOffered('line-1')).toBe(false);
    expect(service.undo('line-1')).toBeNull();
    expect(first.hit.value).toBe(3);
    expect(service.undo('line-2')).toMatchObject({ restored: 1 });
    expect(second.hit.value).toBe(9);
  });

  it('tells which pieces were left because they changed since or are gone, and uses the record up all the same', () => {
    const knight = piece('騎士');
    const squire = piece('従者');
    const gone = piece('案山子');
    service.keep('line-1', reset(knight.character, squire.character, gone.character));
    squire.hit.value = 7;
    gone.character.destroy();
    made = made.filter((character) => character !== gone.character);

    expect(service.undo('line-1')).toEqual({ messageIdentifier: 'line-1', restored: 1, skipped: 2 });

    expect([knight.hit.value, squire.hit.value]).toEqual([9, 7]);
    expect(service.isOffered('line-1')).toBe(false);
  });

  it('says so where every piece changed since, and offers nothing more', () => {
    const { character, hit } = piece('騎士');
    service.keep('line-1', reset(character));
    hit.value = 7;

    expect(service.undo('line-1')).toEqual({ messageIdentifier: 'line-1', restored: 0, skipped: 1 });
    expect(service.isOffered('line-1')).toBe(false);
  });

  it('keeps nothing for a reset that changed nothing, or one with no line to be taken back from', () => {
    const { character } = piece('騎士');
    const record = reset(character);

    service.keep('line-1', { pieces: [] });
    service.keep('', record);

    expect(service.isOffered('line-1')).toBe(false);
    expect(service.isOffered('')).toBe(false);
  });

  it('offers nothing to a seat that only watches, and takes nothing back for it', () => {
    const { character, hit } = piece('騎士');
    service.keep('line-1', reset(character));
    beSeat(PeerRole.Guest);

    expect(service.isOffered('line-1')).toBe(false);
    expect(service.undo('line-1')).toBeNull();
    expect(hit.value).toBe(3);

    beSeat(PeerRole.Player);
    expect(service.isOffered('line-1')).toBe(true);
  });

  it('forgets what it kept when asked to, as a page loaded afresh has', () => {
    const { character } = piece('騎士');
    service.keep('line-1', reset(character));

    service.forget();

    expect(service.isOffered('line-1')).toBe(false);
    expect(service.undo('line-1')).toBeNull();
  });
});
