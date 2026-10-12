import { TestBed } from '@angular/core/testing';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { Config } from '@axe/domain/peer/config';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { BattlePlacementPanelComponent } from '@axe/features/character/battle-placement-panel/battle-placement-panel.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

const GRID = 50;

describe('BattlePlacementPanelComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [BattlePlacementPanelComponent], providers: [...TEST_PROVIDERS] });
    Config.instance.zoneEnabled = true;
    Config.instance.placementDistances = '近い:10,遠い:30';
    Config.instance.distanceModifiers = '12:修正なし,40:命中-4';
    const table = new GameTable();
    table.width = 60;
    table.height = 60;
    table.gridSize = GRID;
    table.initialize();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Config.instance.zoneEnabled = null;
    Config.instance.placementDistances = null;
    Config.instance.distanceModifiers = null;
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  function pieceAt(name: string, col: number, row: number, npc = false): GameCharacter {
    const piece = GameCharacter.create(name, 1, '');
    piece.location = { name: 'table', x: col * GRID, y: row * GRID };
    piece.isNpc = npc;
    return piece;
  }

  async function open(leader: GameCharacter) {
    const fixture = TestBed.createComponent(BattlePlacementPanelComponent);
    fixture.componentInstance.leaderIdentifier.set(leader.identifier);
    await fixture.whenStable();
    return fixture;
  }

  it('offers the pieces on the other side to lead it, and says what the distance between the leaders does', async () => {
    const leader = pieceAt('先頭', 5, 5);
    pieceAt('味方', 6, 5);
    pieceAt('敵将', 15, 5, true);
    const fixture = await open(leader);
    const host = fixture.nativeElement as HTMLElement;

    const options = [...host.querySelectorAll('[data-testid="placement-other"] option')].map((option) =>
      option.textContent?.trim()
    );
    expect(options).toEqual(['敵将']);
    expect(host.querySelector('[data-testid="placement-readout"]')!.textContent).toContain('10.0');
    expect(host.querySelector('[data-testid="placement-note"]')!.textContent).toContain('修正なし');
  });

  it('sets the sides out at the distance chosen from the table', async () => {
    const leader = pieceAt('先頭', 5, 5);
    const other = pieceAt('敵将', 15, 5, true);
    const fixture = await open(leader);
    const host = fixture.nativeElement as HTMLElement;

    const rows = host.querySelector('[data-testid="placement-distance-row"]') as HTMLSelectElement;
    rows.value = '30';
    rows.dispatchEvent(new Event('change'));
    (host.querySelector('[data-testid="placement-place"]') as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(other.location.x).toBe(35 * GRID);
    expect(host.querySelector('[data-testid="placement-note"]')!.textContent).toContain('命中-4');
  });

  it('takes a piece out of the fight', async () => {
    vi.spyOn(TestBed.inject(ChatMessageService), 'sendSystemMessage').mockReturnValue(null as never);
    const leader = pieceAt('先頭', 5, 5);
    pieceAt('敵将', 15, 5, true);
    const fixture = await open(leader);

    const boxes = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLInputElement>(
      '[data-testid="placement-out"]'
    );
    boxes[0].click();

    expect(leader.offField).toBe('1');
  });
});
