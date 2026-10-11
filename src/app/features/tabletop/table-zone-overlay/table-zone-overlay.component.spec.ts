import { TestBed } from '@angular/core/testing';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { EngagementZoneService } from '@axe/application/tabletop/engagement-zone.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { Config } from '@axe/domain/peer/config';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TableZoneOverlayComponent } from '@axe/features/tabletop/table-zone-overlay/table-zone-overlay.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

const GRID = 50;

describe('TableZoneOverlayComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [TableZoneOverlayComponent], providers: [...TEST_PROVIDERS] });
    Config.instance.zoneEnabled = true;
    const table = new GameTable();
    table.width = 20;
    table.height = 20;
    table.gridSize = GRID;
    table.initialize();
    vi.spyOn(TestBed.inject(ChatMessageService), 'sendSystemMessage').mockReturnValue(null as never);
  });

  afterEach(() => {
    Config.instance.zoneEnabled = null;
    vi.restoreAllMocks();
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  function pieceAt(col: number, row: number, npc = false): GameCharacter {
    const piece = GameCharacter.create('コマ', 1, '');
    piece.location = { name: 'table', x: col * GRID, y: row * GRID };
    piece.isNpc = npc;
    return piece;
  }

  it('draws nothing while there is no zone', async () => {
    const fixture = TestBed.createComponent(TableZoneOverlayComponent);
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="zone-overlay"]')).toBeNull();
  });

  it('draws a declared zone as a circle about its centre, and a ring about a piece inside it', async () => {
    TestBed.inject(EngagementZoneService).declare(pieceAt(5, 5), pieceAt(5, 5, true));
    pieceAt(6, 5);
    const fixture = TestBed.createComponent(TableZoneOverlayComponent);
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    const circle = host.querySelector('[data-testid="zone-mark"] circle')!;
    expect(circle.getAttribute('cx')).toBe(`${5.5 * GRID}`);
    expect(Number(circle.getAttribute('r'))).toBeGreaterThan(0);
    expect(host.querySelectorAll('[data-testid="zone-inside-mark"]')).toHaveLength(1);
  });
});
