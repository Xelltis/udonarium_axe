import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GroundService } from '@axe/application/tabletop/ground.service';
import { HeldPiece, HeldPieceService } from '@axe/application/tabletop/held-piece.service';
import { TableCameraService } from '@axe/application/tabletop/table-camera.service';
import { TablePiecesService } from '@axe/application/tabletop/table-pieces.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DEFAULT_TABLE_CAMERA_VIEW } from '@axe/domain/tabletop/camera/table-camera';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { TableAltitudeGuideOverlayComponent } from '@axe/features/tabletop/table-altitude-guide-overlay/table-altitude-guide-overlay.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('TableAltitudeGuideOverlayComponent', () => {
  let fixture: ComponentFixture<TableAltitudeGuideOverlayComponent>;
  let guides: HeldPieceService;
  let walker: GameCharacter;

  const aloft = (altitude: number, identifier = walker.identifier): HeldPiece => ({
    identifier,
    x: 100,
    y: 200,
    widthPx: 50,
    heightPx: 50,
    altitude,
    gridSize: 50,
    liftable: true,
  });

  const drawn = async (): Promise<HTMLElement> => {
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  };

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [TableAltitudeGuideOverlayComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
    const table = new GameTable();
    table.width = 20;
    table.height = 20;
    table.initialize();
    TestBed.inject(TableSelecter).viewTableIdentifier = table.identifier;
    walker = GameCharacter.create('walker', 1, '');
    walker.location = { name: 'table', x: 100, y: 200 };
    fixture = TestBed.createComponent(TableAltitudeGuideOverlayComponent);
    guides = TestBed.inject(HeldPieceService);
  });

  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  it('draws nothing while nobody is holding a piece off the ground', async () => {
    expect((await drawn()).querySelector('[data-altitude-guide]')).toBeNull();
  });

  it('draws nothing for a piece that is standing on the ground', async () => {
    guides.take(aloft(0));

    expect((await drawn()).querySelector('[data-altitude-guide]')).toBeNull();
  });

  it('stands a pole over the piece held, and marks it once a cell, so the height can be counted', async () => {
    guides.take(aloft(3));

    const root = await drawn();

    expect(root.querySelector('[data-altitude-guide-pole]')).not.toBeNull();
    expect(root.querySelectorAll('[data-altitude-guide-rung]')).toHaveLength(3);
  });

  it('says the height, and says which way it is', async () => {
    guides.take(aloft(3));
    expect((await drawn()).querySelector('[data-altitude-guide-reading]')?.textContent?.trim()).toBe('+3');

    guides.take(aloft(-2));
    expect((await drawn()).querySelector('[data-altitude-guide-reading]')?.textContent?.trim()).toBe('-2');
  });

  it('marks the ground the piece is being held over, laid flat where the canvas draws it', async () => {
    const camera = TestBed.inject(TableCameraService);
    camera.setLayout({ left: 0, top: 30, width: 1280, height: 770, boardWidth: 1000, boardHeight: 1000 });
    camera.showView(DEFAULT_TABLE_CAMERA_VIEW);
    guides.take(aloft(3));

    const ground = (await drawn()).querySelector<HTMLElement>('[data-altitude-guide-ground]');

    expect(ground?.style.width).toBe('46px');
    expect(ground?.style.transform).toMatch(/^matrix3d\(/);
  });

  it('marks no ground before the camera is set', async () => {
    guides.take(aloft(3));

    expect((await drawn()).querySelector('[data-altitude-guide-ground]')).toBeNull();
  });

  it('puts the pole under a piece in a pit as well', async () => {
    guides.take(aloft(-2));

    expect((await drawn()).querySelectorAll('[data-altitude-guide-rung]')).toHaveLength(2);
  });

  it('stands the pole on the raised ground the canvas stands the piece on', () => {
    TestBed.inject(GroundService).dab({ kind: 'raise', x: 2.5, y: 4.5, radius: 3, strength: 1 });
    guides.take(aloft(2));
    type Laid = { lifted: { height: number }; ground: { height: number } } | null;

    const laid = (fixture.componentInstance as unknown as { laid(): Laid }).laid()!;

    const lift = TestBed.inject(TablePiecesService).footOf(walker).height;
    expect(lift).toBeGreaterThan(0);
    expect(laid.ground.height).toBeCloseTo(lift, 6);
    expect(laid.lifted.height).toBeCloseTo(lift + 100, 6);
  });

  it('goes away once the piece is put down', async () => {
    guides.take(aloft(3));
    expect((await drawn()).querySelector('[data-altitude-guide]')).not.toBeNull();

    guides.letGo(walker.identifier);

    expect((await drawn()).querySelector('[data-altitude-guide]')).toBeNull();
  });

  it('stays where it is when somebody else lets go of their own piece', async () => {
    guides.take(aloft(3));

    guides.letGo('somebody-else');

    expect((await drawn()).querySelector('[data-altitude-guide]')).not.toBeNull();
  });

  it('draws nothing for a piece no longer on the table', async () => {
    guides.take(aloft(2, 'gone'));

    expect((await drawn()).querySelector('[data-altitude-guide]')).toBeNull();
  });
});
