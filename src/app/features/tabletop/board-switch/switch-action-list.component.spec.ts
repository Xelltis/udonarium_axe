import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ConcealmentService } from '@axe/application/tabletop/concealment.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { CONCEALED_LOCATION } from '@axe/domain/tabletop/board-switch/concealment';
import { newSwitchAction, SwitchAction } from '@axe/domain/tabletop/board-switch/switch-definition';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { SwitchActionListComponent } from '@axe/features/tabletop/board-switch/switch-action-list.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

/** The pickers a switch's actions name things with, as the master's panel draws them. */
describe('SwitchActionListComponent', () => {
  let fixture: ComponentFixture<SwitchActionListComponent>;

  function render(actions: SwitchAction[]): void {
    fixture = TestBed.createComponent(SwitchActionListComponent);
    fixture.componentRef.setInput('actions', actions);
    fixture.detectChanges();
  }

  function offered(): string[] {
    const options = fixture.nativeElement.querySelectorAll('[data-testid="switch-action-target"] option');
    return Array.from(options as NodeListOf<HTMLOptionElement>).map((option) => option.textContent?.trim() ?? '');
  }

  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function goblinAt(place: string): GameCharacter {
    const goblin = GameCharacter.create('ゴブリン', 1, '');
    goblin.location = { name: place, x: 100, y: 100 } as never;
    return goblin;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [SwitchActionListComponent], providers: [...TEST_PROVIDERS] });
    const table = new GameTable();
    table.width = 10;
    table.height = 10;
    table.gridSize = 50;
    table.initialize();
    TestBed.inject(TableSelecter).viewTableIdentifier = table.identifier;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  it('looks the room over once for every picker, however often the panel is drawn', () => {
    const concealed = vi.spyOn(TestBed.inject(ConcealmentService), 'concealed');
    render([newSwitchAction('reveal'), newSwitchAction('reveal')]);

    fixture.componentRef.setInput('actions', [
      { ...newSwitchAction('reveal'), delayMs: 500 },
      newSwitchAction('reveal'),
    ]);
    fixture.detectChanges();

    expect(concealed).toHaveBeenCalledTimes(1);
  });

  it('offers a piece the master put out of sight after the list was first drawn', async () => {
    const goblin = goblinAt('table');
    render([newSwitchAction('reveal')]);
    expect(offered()).not.toContain('ゴブリン（キャラクター）');

    goblin.setLocation(CONCEALED_LOCATION);
    await settle();

    expect(offered()).toContain('ゴブリン（キャラクター）');
  });

  it('says where a template is kept as it moves', async () => {
    const goblin = goblinAt('table');
    render([newSwitchAction('spawn')]);
    expect(offered()).toContain('ゴブリン（卓上）');

    goblin.setLocation('graveyard');
    await settle();

    expect(offered()).toContain('ゴブリン（墓場）');
  });
});
