import { TestBed } from '@angular/core/testing';
import { PieceDragGhostService } from '@axe/application/ui/piece-drag-ghost.service';
import { GameCharacter } from '@axe/domain/character/game-character';
import { NpcDragService } from '@axe/features/gm-tools/npc-bar/npc-drag.service';

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
    service.begin(npc, 10, 20);
    service.move(30, 40);
    expect(service.character()).toBe(npc);
  });

  it('draws the character beside the pointer while it is carried', () => {
    const ghost = TestBed.inject(PieceDragGhostService);
    const npc = makeCharacter('A');

    service.begin(npc, 10, 20);
    service.move(30, 40);
    expect(ghost.character()).toBe(npc);
    expect([ghost.x(), ghost.y()]).toEqual([30, 40]);

    service.end(false);
    expect(ghost.character()).toBeNull();
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
