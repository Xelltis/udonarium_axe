import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TableCameraService } from '@axe/application/tabletop/table-camera.service';
import { TableSurfaceService } from '@axe/application/tabletop/table-surface.service';
import { TransientPlacementService } from '@axe/application/tabletop/transient-placement.service';
import { TableDropPreviewComponent } from '@axe/features/tabletop/game-table/table-drop-preview/table-drop-preview.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('TableDropPreviewComponent', () => {
  let fixture: ComponentFixture<TableDropPreviewComponent>;
  let transient: TransientPlacementService;

  const drawn = (): HTMLElement | null => {
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).querySelector('[data-testid="drop-preview"]');
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [TableDropPreviewComponent], providers: [...TEST_PROVIDERS] });
    TestBed.inject(TableCameraService).setLayout({
      left: 10,
      top: 20,
      width: 800,
      height: 600,
      boardWidth: 1000,
      boardHeight: 750,
    });
    vi.spyOn(TestBed.inject(TableSurfaceService), 'pageOf').mockImplementation((surface, x, y) =>
      surface === 'north-wall' ? { x: 10 + x * 2, y: 20 + y * 2 } : null
    );
    transient = TestBed.inject(TransientPlacementService);
    fixture = TestBed.createComponent(TableDropPreviewComponent);
  });

  it('draws nothing while no dragged piece would land on another face', () => {
    expect(drawn()).toBeNull();
  });

  it('lays the outline on the face it would land on, where the face is drawn on the screen', () => {
    transient.showDropPreview({ surface: 'north-wall', x: 30, y: 40, width: 50, height: 25 });

    const outline = drawn();

    expect(outline).not.toBeNull();
    expect(outline!.style.width).toBe('50px');
    expect(outline!.style.height).toBe('25px');
    expect(outline!.style.transform).toBe('matrix3d(2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1, 0, 60, 80, 0, 1)');
  });

  it('draws nothing on a face the screen does not show', () => {
    transient.showDropPreview({ surface: 'floor', x: 30, y: 40, width: 50, height: 25 });

    expect(drawn()).toBeNull();
  });
});
