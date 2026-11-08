import { TestBed } from '@angular/core/testing';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { EngagementZoneService } from '@axe/application/tabletop/engagement-zone.service';
import { FloorCanvasesService } from '@axe/application/tabletop/floor-canvases.service';
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
    expect(TestBed.inject(FloorCanvasesService).all()).toEqual([]);
  });

  it('lays a declared zone on the floor about its centre with a ring about a piece inside it, and lists both', async () => {
    TestBed.inject(EngagementZoneService).declare(pieceAt(5, 5), pieceAt(5, 5, true));
    pieceAt(6, 5);
    const fixture = TestBed.createComponent(TableZoneOverlayComponent);
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    const zone = host.querySelector<HTMLElement>('[data-testid="zone-mark"]')!;
    expect(zone.dataset['x']).toBe(`${5.5 * GRID}`);
    expect(Number(zone.dataset['reach'])).toBeGreaterThan(0);
    expect(host.querySelectorAll('[data-testid="zone-inside-mark"]')).toHaveLength(1);
    const [laid] = TestBed.inject(FloorCanvasesService).all();
    expect(laid.id).toBe('zones-0');
    expect(laid.box.x).toBeLessThan(5.5 * GRID);
    expect(laid.box.x + laid.box.width).toBeGreaterThan(5.5 * GRID);
  });

  it('takes the zone up off the floor once it goes', async () => {
    const zones = TestBed.inject(EngagementZoneService);
    const hero = pieceAt(5, 5);
    zones.declare(hero, pieceAt(5, 5, true));
    const fixture = TestBed.createComponent(TableZoneOverlayComponent);
    await fixture.whenStable();
    expect(TestBed.inject(FloorCanvasesService).all()).toHaveLength(1);

    fixture.destroy();

    expect(TestBed.inject(FloorCanvasesService).all()).toEqual([]);
  });
});
