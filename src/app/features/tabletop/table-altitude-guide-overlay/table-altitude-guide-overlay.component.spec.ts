import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HeldPiece, HeldPieceService } from '@axe/application/tabletop/held-piece.service';
import { TableAltitudeGuideOverlayComponent } from '@axe/features/tabletop/table-altitude-guide-overlay/table-altitude-guide-overlay.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('TableAltitudeGuideOverlayComponent', () => {
  let fixture: ComponentFixture<TableAltitudeGuideOverlayComponent>;
  let guides: HeldPieceService;

  const aloft = (altitude: number): HeldPiece => ({
    identifier: 'walker',
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
    fixture = TestBed.createComponent(TableAltitudeGuideOverlayComponent);
    guides = TestBed.inject(HeldPieceService);
  });

  it('draws nothing while nobody is holding a piece off the ground', async () => {
    expect((await drawn()).querySelector('[data-altitude-guide]')).toBeNull();
  });

  it('draws nothing for a piece that is standing on the ground', async () => {
    guides.take(aloft(0));

    expect((await drawn()).querySelector('[data-altitude-guide]')).toBeNull();
  });

  it('stands a pole as tall as the piece is high', async () => {
    guides.take(aloft(3));

    const pole = (await drawn()).querySelector<HTMLElement>('[data-altitude-guide-pole]');

    expect(pole?.style.height).toBe('150px');
  });

  it('marks the pole once a cell, so the height can be counted', async () => {
    guides.take(aloft(3));

    const rungs = [...(await drawn()).querySelectorAll<HTMLElement>('[data-altitude-guide-rung]')];

    expect(rungs.map((rung) => rung.style.top)).toEqual(['100px', '50px', '0px']);
  });

  it('says the height, and says which way it is', async () => {
    guides.take(aloft(3));
    expect((await drawn()).querySelector('[data-altitude-guide-reading]')?.textContent?.trim()).toBe('+3');

    guides.take(aloft(-2));
    expect((await drawn()).querySelector('[data-altitude-guide-reading]')?.textContent?.trim()).toBe('-2');
  });

  it('marks the ground the piece is being held over', async () => {
    guides.take(aloft(3));

    const ground = (await drawn()).querySelector<HTMLElement>('[data-altitude-guide-ground]');

    expect(ground).not.toBeNull();
    expect(ground?.style.width).toBe('46px');
  });

  it('puts the pole under a piece in a pit as well', async () => {
    guides.take(aloft(-2));

    const pole = (await drawn()).querySelector<HTMLElement>('[data-altitude-guide-pole]');
    const rungs = [...(await drawn()).querySelectorAll<HTMLElement>('[data-altitude-guide-rung]')];

    expect(pole?.style.height).toBe('100px');
    expect(rungs).toHaveLength(2);
  });

  it('goes away once the piece is put down', async () => {
    guides.take(aloft(3));
    expect((await drawn()).querySelector('[data-altitude-guide]')).not.toBeNull();

    guides.letGo('walker');

    expect((await drawn()).querySelector('[data-altitude-guide]')).toBeNull();
  });

  it('stays where it is when somebody else lets go of their own piece', async () => {
    guides.take(aloft(3));

    guides.letGo('somebody-else');

    expect((await drawn()).querySelector('[data-altitude-guide]')).not.toBeNull();
  });
});
