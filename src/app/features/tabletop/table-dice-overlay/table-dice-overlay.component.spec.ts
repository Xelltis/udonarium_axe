import { TestBed } from '@angular/core/testing';
import { DiceRenderService } from '@axe/application/dice/dice-render.service';
import { TableDiceOverlayComponent } from '@axe/features/tabletop/table-dice-overlay/table-dice-overlay.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('TableDiceOverlayComponent', () => {
  let registered: { canvas: HTMLCanvasElement; released: boolean }[];

  beforeEach(() => {
    registered = [];
    TestBed.configureTestingModule({
      imports: [TableDiceOverlayComponent],
      providers: [
        ...TEST_PROVIDERS,
        {
          provide: DiceRenderService,
          useValue: {
            registerTable: (canvas: HTMLCanvasElement) => {
              const entry = { canvas, released: false };
              registered.push(entry);
              return { resize: () => undefined, release: () => (entry.released = true) };
            },
          },
        },
      ],
    });
  });

  it('lays its sheet over the table for the dice to be drawn on, and takes it away when it goes', async () => {
    const fixture = TestBed.createComponent(TableDiceOverlayComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const canvas = fixture.nativeElement.querySelector('[data-testid="table-dice-overlay"]');
    expect(registered).toHaveLength(1);
    expect(registered[0].canvas).toBe(canvas);
    expect(fixture.nativeElement.classList).toContain('pointer-events-none');

    fixture.destroy();

    expect(registered[0].released).toBe(true);
  });
});
