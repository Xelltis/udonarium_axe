import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import {
  FOREGROUND_SEE_THROUGH_OPACITY,
  ForegroundSeeThroughService,
} from '@axe/application/ui/foreground-see-through.service';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { TableForegroundOverlayComponent } from '@axe/features/tabletop/table-foreground-overlay/table-foreground-overlay.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('TableForegroundOverlayComponent', () => {
  const MIST = 'f'.repeat(64);
  let fixture: ComponentFixture<TableForegroundOverlayComponent>;
  let table: GameTable;

  beforeEach(() => {
    localStorage.clear();
    PeerCursor.createMyCursor();
    TestBed.configureTestingModule({
      imports: [TableForegroundOverlayComponent],
      providers: [...TEST_PROVIDERS, TabletopService],
    });
    ImageStorage.instance.add({
      identifier: MIST,
      name: 'mist.webp',
      type: 'image/webp',
      blob: new Blob(['mist'], { type: 'image/webp' }),
      url: 'blob:mist',
      thumbnail: { type: '', blob: null, url: '' },
    });
    table = new GameTable();
    table.initialize();
    TableSelecter.instance.viewTableIdentifier = table.identifier;
    fixture = TestBed.createComponent(TableForegroundOverlayComponent);
  });

  afterEach(() => {
    ObjectStore.instance.remove(table);
    ImageStorage.instance.delete(MIST);
  });

  const picture = () => (fixture.nativeElement as HTMLElement).querySelector<HTMLImageElement>('img');

  it('lays nothing for a table that lays nothing', () => {
    fixture.detectChanges();

    expect(picture()).toBeNull();
  });

  it('lays the table’s picture over the whole view, as opaque and fitted as the table says', () => {
    table.foregroundImageIdentifier = MIST;
    table.foregroundOpacity = 0.6;
    table.foregroundFit = 'contain';
    fixture.detectChanges();

    expect(picture()?.getAttribute('src')).toBe('blob:mist');
    expect(picture()?.style.opacity).toBe('0.6');
    expect(picture()?.style.objectFit).toBe('contain');
  });

  it('takes no click, which goes on to the board under it', () => {
    table.foregroundImageIdentifier = MIST;
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).classList).toContain('pointer-events-none');
  });

  it.each([
    [PeerRole.GameMaster, `${FOREGROUND_SEE_THROUGH_OPACITY}`],
    [PeerRole.Player, '1'],
    [PeerRole.Guest, '1'],
  ])('lets the game master alone see through it, on this screen: %s sees it at %s', (role, opacity) => {
    PeerCursor.myCursor.role = role;
    table.foregroundImageIdentifier = MIST;
    TestBed.inject(ForegroundSeeThroughService).set(true);
    fixture.detectChanges();

    expect(picture()?.style.opacity).toBe(opacity);
  });
});
