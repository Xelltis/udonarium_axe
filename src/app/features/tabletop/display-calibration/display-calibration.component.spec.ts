import { WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { DisplayCalibrationService } from '@axe/application/ui/display-calibration.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { DisplayCalibrationComponent } from '@axe/features/tabletop/display-calibration/display-calibration.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('DisplayCalibrationComponent', () => {
  let component: DisplayCalibrationComponent;
  let fixture: ComponentFixture<DisplayCalibrationComponent>;
  let calibration: DisplayCalibrationService;
  let table: GameTable;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [DisplayCalibrationComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
    table = TestBed.inject(TabletopService).currentTable;
    fixture = TestBed.createComponent(DisplayCalibrationComponent);
    component = fixture.componentInstance;
    calibration = TestBed.inject(DisplayCalibrationService);
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('starts on one card, with a frame a plausible screen would need', () => {
    expect(component.cards()).toBe(1);
    expect(component.framePx()).toBeGreaterThan(200);
    expect(component.runWidthMm()).toBe('85.6');
  });

  it('keeps the frame in the proportions of a card, so both edges can be checked', () => {
    component.onFrameInput('274');

    expect(component.frameHeightPx()).toBeCloseTo(172.8, 1);
  });

  it('reads the density back as the frame is stretched', () => {
    component.onFrameInput('274');

    expect(component.pxPerMmLabel()).toBe('3.20');
    expect(component.dpi()).toBe(81);
    expect(component.cellPx()).toBe(81);
  });

  it('reads the square in inches too, since a base is sold by the inch', () => {
    expect(component.cellInchesLabel()).toBe('1.00');

    component.onCellMmInput('50.8');

    expect(component.cellInchesLabel()).toBe('2.00');
  });

  describe('dragging the corner of the frame', () => {
    /** The handle captures the pointer, so the element has to answer as though it did. */
    function handle(captured: boolean): Element {
      return {
        setPointerCapture: () => undefined,
        releasePointerCapture: () => undefined,
        hasPointerCapture: () => captured,
      } as unknown as Element;
    }

    function drag(target: Element, clientX: number): PointerEvent {
      return { target, clientX, pointerId: 1, preventDefault: () => undefined } as unknown as PointerEvent;
    }

    it('widens the frame by however far the pointer moved', () => {
      component.onFrameInput('274');
      const grip = handle(true);

      component.onHandleDown(drag(grip, 500));
      component.onHandleMove(drag(grip, 560));

      expect(component.framePx()).toBe(334);
    });

    it('narrows it just as readily', () => {
      component.onFrameInput('274');
      const grip = handle(true);

      component.onHandleDown(drag(grip, 500));
      component.onHandleMove(drag(grip, 460));

      expect(component.framePx()).toBe(234);
    });

    it('stays inside the range a card could match', () => {
      component.onFrameInput('274');
      const grip = handle(true);

      component.onHandleDown(drag(grip, 500));
      component.onHandleMove(drag(grip, -10000));

      expect(component.framePx()).toBe(40);
    });

    it('ignores a pointer it never took hold of', () => {
      component.onFrameInput('274');
      const grip = handle(false);

      component.onHandleMove(drag(grip, 900));

      expect(component.framePx()).toBe(274);
    });

    it('agrees with the slider, which writes the same value', () => {
      const grip = handle(true);
      component.onHandleDown(drag(grip, 0));
      component.onHandleMove(drag(grip, 100));
      const dragged = component.framePx();

      component.onFrameInput(String(dragged));

      expect(component.framePx()).toBe(dragged);
    });
  });

  it('moves the frame a pixel at a time, which is where the last accuracy comes from', () => {
    component.onFrameInput('274');

    component.nudgeFrame(1);

    expect(component.framePx()).toBe(275);
  });

  it('widens the frame rather than starting over when a second card is laid down', () => {
    component.onFrameInput('274');

    component.setCards(2);

    expect(component.framePx()).toBe(548);
    // The same screen, measured across twice the distance.
    expect(component.pxPerMmLabel()).toBe('3.20');
  });

  describe('when the panel is too narrow to show two cards whole', () => {
    /** What the resize observer would have written after laying the panel out. */
    function frameAreaIs(px: number): void {
      (component as unknown as { frameAreaPx: WritableSignal<number> }).frameAreaPx.set(px);
    }

    it('offers the second card while there is room for it', () => {
      component.onFrameInput('274');
      frameAreaIs(1334);

      expect(component.twoCardsFit()).toBe(true);

      component.setCards(2);

      expect(component.cards()).toBe(2);
    });

    it('withholds it once there is not, rather than leaving a frame that has to be scrolled', () => {
      component.onFrameInput('274');
      frameAreaIs(400);

      expect(component.twoCardsFit()).toBe(false);

      component.setCards(2);

      expect(component.cards()).toBe(1);
      expect(component.framePx()).toBe(274);
    });

    it('follows the frame, since a denser screen needs more room for the same two cards', () => {
      frameAreaIs(700);
      component.onFrameInput('274');
      expect(component.twoCardsFit()).toBe(true);

      // A denser screen: the same card matches a wider frame, so two of them need more room.
      component.onFrameInput('420');

      expect(component.twoCardsFit()).toBe(false);
    });

    it('offers it before the panel has been measured, having nothing yet to go on', () => {
      expect(component.twoCardsFit()).toBe(true);
    });

    it('lets a second card already in hand stay', () => {
      component.onFrameInput('274');
      frameAreaIs(1334);
      component.setCards(2);

      frameAreaIs(400);

      expect(component.cards()).toBe(2);
    });
  });

  it('refuses a frame no card could match', () => {
    component.onFrameInput('0');
    expect(component.framePx()).toBe(40);

    component.onFrameInput('not a number');
    expect(component.framePx()).toBe(40);
  });

  it('keeps the measurement here and the square on the table', () => {
    component.onFrameInput('274');
    component.onCellMmInput('25.4');

    component.confirm();

    expect(calibration.pxPerMm()).toBeCloseTo(3.201, 3);
    expect(calibration.realSizeEnabled()).toBe(true);
    // The width of a square is the map's, so it goes where the map is shared from.
    expect(table.cellMm).toBe(25.4);
  });

  it('writes a square that is not an inch onto the table', () => {
    component.onFrameInput('274');
    component.onCellMmInput('50.8');

    component.confirm();

    expect(table.cellMm).toBe(50.8);
  });

  it('leaves the screen unmeasured when the reader backs out', () => {
    component.onFrameInput('274');

    component.cancel();

    expect(calibration.isCalibrated()).toBe(false);
  });

  it('closes either way', () => {
    const resolve = vi.spyOn(TestBed.inject(ModalService), 'resolve').mockImplementation(() => undefined);

    component.confirm();
    component.cancel();

    expect(resolve).toHaveBeenCalledTimes(2);
  });
});
