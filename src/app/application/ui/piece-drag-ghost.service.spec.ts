import { TestBed } from '@angular/core/testing';
import { PieceDragGhostService } from '@axe/application/ui/piece-drag-ghost.service';
import { GameCharacter } from '@axe/domain/character/game-character';

describe('PieceDragGhostService', () => {
  let ghost: PieceDragGhostService;

  beforeEach(() => {
    ghost = TestBed.inject(PieceDragGhostService);
  });

  it('draws nothing until a piece is carried', () => {
    expect(ghost.character()).toBeNull();
  });

  it('follows the pointer with the piece and how many go with it', () => {
    const goblin = GameCharacter.create('ゴブリン', 1, '');

    ghost.show(goblin, 10, 20, 3);
    ghost.move(30, 40);

    expect(ghost.character()).toBe(goblin);
    expect(ghost.count()).toBe(3);
    expect([ghost.x(), ghost.y()]).toEqual([30, 40]);
  });

  it('lets the piece go, and counts one again for the next carry', () => {
    ghost.show(GameCharacter.create('ゴブリン', 1, ''), 0, 0, 3);

    ghost.hide();

    expect(ghost.character()).toBeNull();
    expect(ghost.count()).toBe(1);
  });
});
