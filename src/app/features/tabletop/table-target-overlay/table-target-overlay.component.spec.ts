import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FloorCanvasesService } from '@axe/application/tabletop/floor-canvases.service';
import { Card } from '@axe/domain/card/card';
import {
  TableTargetOverlayComponent,
  targetArrowMarksOf,
} from '@axe/features/tabletop/table-target-overlay/table-target-overlay.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('TableTargetOverlayComponent', () => {
  let fixture: ComponentFixture<TableTargetOverlayComponent>;
  const created: Card[] = [];

  function makeCard(x: number, y: number): Card {
    const card = Card.create('カード', '', '');
    card.location.name = 'table';
    card.location.x = x;
    card.location.y = y;
    created.push(card);
    return card;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TableTargetOverlayComponent],
      providers: [...TEST_PROVIDERS],
    });
    fixture = TestBed.createComponent(TableTargetOverlayComponent);
  });

  afterEach(() => {
    for (const card of created.splice(0)) card.destroy();
  });

  it('draws nothing without a target', () => {
    makeCard(0, 0);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('[data-testid="target-arrow"]')).toHaveLength(0);
    expect(TestBed.inject(FloorCanvasesService).all()).toEqual([]);
  });

  it('lays an arrow from each piece to its target on the floor, and lists it', () => {
    const source = makeCard(0, 0);
    const target = makeCard(300, 0);
    source.targetIdentifier = target.identifier;
    fixture.detectChanges();
    TestBed.tick();

    const [arrow] = fixture.nativeElement.querySelectorAll('[data-testid="target-arrow"]') as NodeListOf<HTMLElement>;
    expect(Number(arrow.dataset['toX']) - Number(arrow.dataset['fromX'])).toBeCloseTo(300, 6);
    const [laid] = TestBed.inject(FloorCanvasesService).all();
    expect(laid.id).toBe('target-arrows-0');
    expect(laid.box.width).toBeGreaterThan(300);
  });
});

describe('targetArrowMarksOf', () => {
  it('draws a shaft along the arrow and a head pointing at its end', () => {
    const [shaft, head] = targetArrowMarksOf({ identifier: 'a', x: 10, y: 20, z: 0, length: 100, angle: 0 });

    expect(shaft).toMatchObject({
      kind: 'line',
      points: [
        { x: 10, y: 20 },
        { x: 84, y: 20 },
      ],
    });
    expect(head).toMatchObject({ kind: 'line', closed: true, points: [{}, { x: 110, y: 20 }, {}] });
  });
});
