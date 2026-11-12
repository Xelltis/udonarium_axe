import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { targetNameOf } from '@axe/domain/replay/replay-piece';
import { afterEach, describe, expect, it } from 'vitest';

describe('targetNameOf()', () => {
  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  it('records a piece by its name, and one whose name is hidden by the label everyone is told', () => {
    const hero = GameCharacter.create('勇者', 1, '');
    const villain = GameCharacter.create('黒幕', 1, '');
    villain.hideName = true;

    expect(targetNameOf(hero)).toBe('勇者');
    expect(targetNameOf(villain)).toBe('？？？');
  });
});
