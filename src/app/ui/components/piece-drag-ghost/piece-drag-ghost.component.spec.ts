import { TestBed } from '@angular/core/testing';
import { PieceDragGhostService } from '@axe/application/ui/piece-drag-ghost.service';
import { GameCharacter } from '@axe/domain/character/game-character';
import { PieceDragGhostComponent } from '@axe/ui/components/piece-drag-ghost/piece-drag-ghost.component';

describe('PieceDragGhostComponent', () => {
  function render() {
    const fixture = TestBed.createComponent(PieceDragGhostComponent);
    fixture.detectChanges();
    return fixture;
  }

  const ghostOf = (fixture: ReturnType<typeof render>) =>
    fixture.nativeElement.querySelector('[data-testid="piece-drag-ghost"]') as HTMLElement | null;

  it('draws nothing while nothing is carried', () => {
    expect(ghostOf(render())).toBeNull();
  });

  it('draws the carried piece just off the pointer', () => {
    TestBed.inject(PieceDragGhostService).show(GameCharacter.create('ゴブリン', 1, ''), 100, 200);

    const ghost = ghostOf(render());

    expect(ghost?.style.left).toBe('112px');
    expect(ghost?.style.top).toBe('212px');
  });
});
