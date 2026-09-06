import { TestBed } from '@angular/core/testing';
import { DisplayCalibrationService } from '@axe/application/ui/display-calibration.service';
import { ViewLockService } from '@axe/application/ui/view-lock.service';

describe('DisplayCalibrationService', () => {
  function service(): DisplayCalibrationService {
    TestBed.resetTestingModule();
    return TestBed.inject(DisplayCalibrationService);
  }

  function setScreenScale(scale: number): void {
    Object.defineProperty(window, 'devicePixelRatio', { value: scale, configurable: true });
  }

  const realMatchMedia = window.matchMedia;

  beforeEach(() => setScreenScale(1));

  afterEach(() => {
    setScreenScale(1);
    Object.defineProperty(window, 'matchMedia', { value: realMatchMedia, configurable: true });
  });

  describe('before the screen has been measured', () => {
    it('knows nothing about the panel', () => {
      const calibration = service();

      expect(calibration.pxPerMm()).toBeNull();
      expect(calibration.isCalibrated()).toBe(false);
      expect(calibration.dpi()).toBeNull();
      expect(calibration.zoomFor(25.4, 50)).toBeNull();
    });

    it('leaves real size off', () => {
      expect(service().realSizeEnabled()).toBe(false);
    });

    it('has nothing to warn about', () => {
      expect(service().needsRecalibration()).toBe(false);
    });

    it('ignores a nudge, having nothing to nudge', () => {
      const calibration = service();

      calibration.nudge(1);

      expect(calibration.pxPerMm()).toBeNull();
    });
  });

  describe('once a card has been matched', () => {
    it('works out the density', () => {
      const calibration = service();

      calibration.calibrateFromCardRun(274, 1);

      expect(calibration.pxPerMm()).toBeCloseTo(3.201, 3);
      expect(calibration.dpi()).toBe(81);
    });

    it('reaches the same answer from two cards as from one', () => {
      const one = service();
      one.calibrateFromCardRun(274, 1);
      const single = one.pxPerMm();

      const two = service();
      two.calibrateFromCardRun(548, 2);

      expect(two.pxPerMm()).toBeCloseTo(single as number, 6);
    });

    it('gives the zoom that makes a square the width the table asks for', () => {
      const calibration = service();

      calibration.calibrateFromCardRun(274, 1);

      expect(calibration.zoomFor(25.4, 50)).toBeCloseTo(1.626, 3);
      // A map drawn for wider squares needs more zoom for the same screen.
      expect(calibration.zoomFor(50.8, 50)).toBeCloseTo(3.252, 3);
    });

    it('moves the density a little at a time', () => {
      const calibration = service();
      calibration.calibrateFromCardRun(274, 1);
      const measured = calibration.pxPerMm() as number;

      calibration.nudge(1);

      expect(calibration.pxPerMm()).toBeCloseTo(measured * 1.002, 6);
    });
  });

  describe('nothing is written down', () => {
    it('starts every session unmeasured, since no screen can be identified', () => {
      const first = service();
      first.calibrateFromCardRun(274, 1);
      first.setRealSizeEnabled(true);

      const second = service();

      expect(second.isCalibrated()).toBe(false);
      expect(second.realSizeEnabled()).toBe(false);
    });

    it('leaves no trace in the browser', () => {
      const calibration = service();

      calibration.calibrateFromCardRun(274, 1);
      calibration.setRealSizeEnabled(true);

      expect(localStorage.getItem('ui-display-calibration')).toBeNull();
    });
  });

  describe('real size and the lock', () => {
    it('holds the view still as soon as real size is asked for', () => {
      const calibration = service();
      const lock = TestBed.inject(ViewLockService);
      calibration.calibrateFromCardRun(274, 1);
      expect(lock.locked()).toBe(false);

      calibration.setRealSizeEnabled(true);

      // Nothing else holds the scale: the first touch on the board would pull it back.
      expect(lock.locked()).toBe(true);
    });

    it('leaves the lock where it is when real size is turned off', () => {
      const calibration = service();
      const lock = TestBed.inject(ViewLockService);
      calibration.calibrateFromCardRun(274, 1);
      calibration.setRealSizeEnabled(true);

      calibration.setRealSizeEnabled(false);

      // The lock stands on its own; somebody may want the board still without real size.
      expect(lock.locked()).toBe(true);
    });
  });

  describe('resetting', () => {
    it('puts the screen back to never having been measured', () => {
      const calibration = service();
      const lock = TestBed.inject(ViewLockService);
      calibration.calibrateFromCardRun(274, 1);
      calibration.setRealSizeEnabled(true);

      calibration.reset();

      expect(calibration.isCalibrated()).toBe(false);
      expect(calibration.realSizeEnabled()).toBe(false);
      expect(lock.locked()).toBe(false);
    });

    it('clears a standing warning along with the measurement it was about', () => {
      const calibration = service();
      calibration.calibrateFromCardRun(274, 1);
      setScreenScale(2);
      calibration.refreshScreenScale();
      expect(calibration.needsRecalibration()).toBe(true);

      calibration.reset();

      expect(calibration.needsRecalibration()).toBe(false);
    });
  });

  describe('when the screen changes under a measurement', () => {
    it('asks to be measured again rather than correcting silently', () => {
      const calibration = service();
      calibration.calibrateFromCardRun(274, 1);
      expect(calibration.needsRecalibration()).toBe(false);

      setScreenScale(2);
      calibration.refreshScreenScale();

      expect(calibration.needsRecalibration()).toBe(true);
      expect(calibration.pxPerMm()).toBeCloseTo(3.201, 3);
    });

    it('notices a move to another display, which reports no resize of its own', () => {
      // A pixel ratio query stands in for the display: changing it is the only signal there is.
      const listeners = new Set<() => void>();
      const matchMedia = vi.fn(
        () =>
          ({
            matches: true,
            addEventListener: (_: string, listener: () => void) => listeners.add(listener),
            removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
          }) as unknown as MediaQueryList
      );
      Object.defineProperty(window, 'matchMedia', { value: matchMedia, configurable: true });

      const calibration = service();
      calibration.calibrateFromCardRun(274, 1);
      expect(calibration.needsRecalibration()).toBe(false);
      expect(listeners.size).toBe(1);

      // The window is dragged to a display of a different density. No resize is reported.
      setScreenScale(2);
      for (const listener of [...listeners]) listener();

      expect(calibration.needsRecalibration()).toBe(true);
      // And it is listening again, on the ratio it has now, ready for the way back.
      expect(listeners.size).toBe(1);
      expect(matchMedia).toHaveBeenCalledWith('(resolution: 2dppx)');
    });

    it('carries on without the query when the browser offers none', () => {
      Object.defineProperty(window, 'matchMedia', { value: undefined, configurable: true });

      const calibration = service();
      calibration.calibrateFromCardRun(274, 1);
      setScreenScale(2);
      calibration.refreshScreenScale();

      expect(calibration.needsRecalibration()).toBe(true);
    });

    it('keeps the warning standing while unrelated settings are changed', () => {
      const calibration = service();
      calibration.calibrateFromCardRun(274, 1);
      setScreenScale(2);
      calibration.refreshScreenScale();
      expect(calibration.needsRecalibration()).toBe(true);

      // This says nothing about the screen, so it may not clear the warning.
      calibration.setRealSizeEnabled(true);
      expect(calibration.needsRecalibration()).toBe(true);
    });

    it('clears the warning only when the screen is measured again', () => {
      const calibration = service();
      calibration.calibrateFromCardRun(274, 1);
      setScreenScale(2);
      calibration.refreshScreenScale();

      calibration.nudge(1);

      // A nudge is a measurement by eye, taken on the screen in front of us.
      expect(calibration.needsRecalibration()).toBe(false);
    });

    it('says nothing about a window that was only resized', () => {
      const calibration = service();
      calibration.calibrateFromCardRun(274, 1);

      calibration.refreshScreenScale();

      expect(calibration.needsRecalibration()).toBe(false);
    });
  });
});
