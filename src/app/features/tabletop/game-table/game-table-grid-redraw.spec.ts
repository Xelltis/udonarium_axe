import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RenderLiteService } from '@axe/application/ui/render-lite.service';
import { GridType } from '@axe/domain/tabletop/game-table';
import { GameTableComponent } from '@axe/features/tabletop/game-table/game-table.component';
import { GridLineRender } from '@axe/features/tabletop/game-table/grid-line-render';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('drawing the grid over the board', () => {
  let component: GameTableComponent;
  let fixture: ComponentFixture<GameTableComponent>;
  let drawn: ReturnType<typeof vi.spyOn>;
  let drawnInPart: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [GameTableComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
    drawn = vi.spyOn(GridLineRender.prototype, 'render');
    drawnInPart = vi.spyOn(GridLineRender.prototype, 'renderViewport');
    fixture = TestBed.createComponent(GameTableComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const draws = (): number => drawn.mock.calls.length + drawnInPart.mock.calls.length;

  it('draws it while the board is set up', () => {
    expect(draws()).toBe(1);
  });

  it('leaves it as it stands when something else about the table changes', async () => {
    drawn.mockClear();
    drawnInPart.mockClear();

    component.currentTable.name = 'the cellar';
    component.currentTable.imageIdentifier = 'another-floor';
    await Promise.resolve();
    await fixture.whenStable();

    expect(draws()).toBe(0);
  });

  it('draws it again when the board is resized, laid out differently or coloured differently', async () => {
    drawn.mockClear();
    drawnInPart.mockClear();

    component.currentTable.gridSize = 37;
    await Promise.resolve();
    await fixture.whenStable();
    expect(draws()).toBe(1);

    component.currentTable.gridColor = '#ff0000';
    await Promise.resolve();
    await fixture.whenStable();
    expect(draws()).toBe(2);

    component.currentTable.gridType = GridType.HEX_VERTICAL;
    await Promise.resolve();
    await fixture.whenStable();
    expect(draws()).toBe(3);

    component.currentTable.width = component.currentTable.width + 1;
    await Promise.resolve();
    await fixture.whenStable();
    expect(draws()).toBe(4);
  });

  it('covers the board pixel for pixel while the board is drawn the usual way', async () => {
    TestBed.inject(RenderLiteService).set('off');
    const table = component.currentTable;
    table.width = 100;
    table.height = 100;
    table.gridSize = 50;
    await Promise.resolve();
    await fixture.whenStable();

    const canvas = component.gridCanvas().nativeElement;
    expect(canvas.width).toBe(5000);
    expect(canvas.height).toBe(5000);
    expect(canvas.style.width).toBe('');
    expect(canvas.style.height).toBe('');
  });

  it('holds the grid to the light pixel budget while the board is drawn the lighter way', async () => {
    const renderLite = TestBed.inject(RenderLiteService);
    renderLite.set('off');
    const table = component.currentTable;
    table.width = 100;
    table.height = 100;
    table.gridSize = 50;
    await Promise.resolve();
    await fixture.whenStable();

    renderLite.set('on');
    await fixture.whenStable();

    const canvas = component.gridCanvas().nativeElement;
    expect(canvas.width * canvas.height).toBeLessThanOrEqual(4_000_000);
    expect(canvas.width).toBeGreaterThan(0);
    // The browser lets the canvas back up to the size of the board.
    expect(canvas.style.width).toBe('5000px');
    expect(canvas.style.height).toBe('5000px');
  });

  it('still shows and hides the grid on a change that draws nothing', async () => {
    vi.useFakeTimers();
    try {
      component.currentTable.gridShow = false;
      await Promise.resolve();
      vi.runAllTimers();
      expect(component.gridCanvas().nativeElement.style.opacity).toBe('0');

      component.currentTable.gridShow = true;
      await Promise.resolve();
      vi.runAllTimers();
      expect(component.gridCanvas().nativeElement.style.opacity).toBe('1');
    } finally {
      vi.useRealTimers();
    }
  });
});
