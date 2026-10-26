import { TestBed } from '@angular/core/testing';
import { NpcDragService } from '@axe/application/tabletop/npc-drag.service';
import { GameCharacter } from '@axe/domain/character/game-character';

function makeCharacter(name: string, isNpc = false): GameCharacter {
  const character = GameCharacter.create(name, 1, '');
  character.isNpc = isNpc;
  return character;
}

describe('NpcDragService', () => {
  let service: NpcDragService;

  beforeEach(() => {
    service = TestBed.inject(NpcDragService);
  });

  it('holds the character through a drag', () => {
    const npc = makeCharacter('A');
    service.begin(npc);
    expect(service.character()).toBe(npc);
  });

  it('registers the character on a drop and lets go', () => {
    const npc = makeCharacter('B', false);
    service.begin(npc);
    service.end(true);
    expect(npc.isNpc).toBe(true);
    expect(service.character()).toBeNull();
  });

  it('registers nothing on a cancel and lets go all the same', () => {
    const npc = makeCharacter('C', false);
    service.begin(npc);
    service.end(false);
    expect(npc.isNpc).toBe(false);
    expect(service.character()).toBeNull();
  });
});
