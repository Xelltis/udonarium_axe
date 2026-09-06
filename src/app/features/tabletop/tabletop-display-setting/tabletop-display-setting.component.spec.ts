import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { DisplayCalibrationService } from '@axe/application/ui/display-calibration.service';
import {
  TABLETOP_DISPLAY_SETTINGS_STORAGE_KEY,
  TabletopDisplaySettingsService,
} from '@axe/application/ui/tabletop-display-settings.service';
import { ViewLockService } from '@axe/application/ui/view-lock.service';
import { MultiAngleMotionMode } from '@axe/domain/tabletop/multi-angle';
import { TabletopDisplaySettingComponent } from '@axe/features/tabletop/tabletop-display-setting/tabletop-display-setting.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('TabletopDisplaySettingComponent', () => {
  let fixture: ComponentFixture<TabletopDisplaySettingComponent>;
  /** The calibration members are protected for the template, so the tests reach them by shape. */
  let component: {
    isCalibrated(): boolean;
    calibrationDpi(): number | null;
    viewLocked: boolean;
    realSizeEnabled: boolean;
    nudgeScale(steps: number): void;
    resetCalibration(): void;
  };
  let settings: TabletopDisplaySettingsService;

  beforeEach(async () => {
    localStorage.removeItem(TABLETOP_DISPLAY_SETTINGS_STORAGE_KEY);
    TestBed.configureTestingModule({
      imports: [TabletopDisplaySettingComponent],
      providers: [...TEST_PROVIDERS],
    });
    await TestBed.compileComponents();
    settings = TestBed.inject(TabletopDisplaySettingsService);
    fixture = TestBed.createComponent(TabletopDisplaySettingComponent);
    component = fixture.componentInstance as unknown as typeof component;
    fixture.detectChanges();
  });

  afterEach(() => localStorage.removeItem(TABLETOP_DISPLAY_SETTINGS_STORAGE_KEY));

  it('keeps the local options visible but disabled until tabletop display mode is enabled', () => {
    const options = fixture.nativeElement.querySelector(
      '[data-testid="tabletop-display-options"]'
    ) as HTMLFieldSetElement;
    const enabled = fixture.nativeElement.querySelector('[data-testid="tabletop-display-enabled"]') as HTMLInputElement;

    expect(enabled.checked).toBe(false);
    expect(options.disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('このブラウザだけに適用');

    enabled.click();
    fixture.detectChanges();

    expect(settings.enabled()).toBe(true);
    expect(options.disabled).toBe(false);
  });

  it('contains every setting moved out of GameTable', () => {
    const names = [...fixture.nativeElement.querySelectorAll('[name]')].map((element: Element) =>
      element.getAttribute('name')
    );

    expect(names).toEqual(
      expect.arrayContaining([
        'cutInMultiDirectionMode',
        'hoverDetailPlacement',
        'multiAngleFontScale',
        'radialMenuEnabled',
        'radialMenuRotationSpeed',
        'multiAngleEnabled',
        'multiAngleResourceBuffEnabled',
        'multiAngleMotionMode',
        'multiAngleRevolutionSeconds',
        'multiAnglePieceRevolutionSeconds',
        'multiAngleTickerEnabled',
        'multiAngleTickerPixelsPerSecond',
      ])
    );

    settings.patch({ multiAngleMotionMode: 'quarter-turn' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[name="multiAnglePauseSeconds"]')).toBeTruthy();
  });

  it('offers the existing choices and writes them to local settings', () => {
    settings.patch({ enabled: true });
    fixture.detectChanges();
    const cutIn = fixture.nativeElement.querySelector('[name="cutInMultiDirectionMode"]') as HTMLSelectElement;
    const hover = fixture.nativeElement.querySelector('[name="hoverDetailPlacement"]') as HTMLSelectElement;
    const font = fixture.nativeElement.querySelector('[name="multiAngleFontScale"]') as HTMLSelectElement;

    expect([...cutIn.options].map((option) => option.value)).toEqual([
      'none',
      'vertical',
      'vertical-right',
      'vertical-left',
      'four-directions',
    ]);
    expect([...hover.options].map((option) => option.value)).toEqual(['piece', 'screen-edges']);
    expect([...font.options].map((option) => option.value)).toEqual(['small', 'medium', 'large']);

    font.value = 'medium';
    font.dispatchEvent(new Event('change'));
    expect(settings.multiAngleFontScale()).toBe('medium');
  });

  it('enables rotation speed only when the rotating menu is selected', async () => {
    settings.patch({ enabled: true, radialMenuEnabled: false });
    fixture.detectChanges();
    const radial = fixture.nativeElement.querySelector('[name="radialMenuEnabled"]') as HTMLInputElement;
    const speed = fixture.nativeElement.querySelector('[name="radialMenuRotationSpeed"]') as HTMLInputElement;

    expect(speed.disabled).toBe(true);
    radial.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(settings.radialMenuEnabled()).toBe(true);
    expect((fixture.nativeElement.querySelector('[name="radialMenuRotationSpeed"]') as HTMLInputElement).disabled).toBe(
      false
    );
    expect(fixture.nativeElement.textContent).toContain('右クリックで回転メニューを開き');
  });

  it('resets the piece revolution time whenever a motion mode is selected', () => {
    const component = fixture.componentInstance as unknown as {
      multiAngleMotionMode: MultiAngleMotionMode;
    };

    settings.patch({ multiAnglePieceRevolutionSeconds: 90 });
    component.multiAngleMotionMode = 'quarter-turn';
    expect(settings.multiAnglePieceRevolutionSeconds()).toBe(5);

    settings.patch({ multiAnglePieceRevolutionSeconds: 90 });
    component.multiAngleMotionMode = 'piece-quarter-turn';
    expect(settings.multiAnglePieceRevolutionSeconds()).toBe(5);

    settings.patch({ multiAnglePieceRevolutionSeconds: 90 });
    component.multiAngleMotionMode = 'continuous';
    expect(settings.multiAnglePieceRevolutionSeconds()).toBe(60);
  });
  describe('what this screen measures', () => {
    it('drops the perspective as soon as the browser is a tabletop display', () => {
      const tabletop = TestBed.inject(TabletopService);
      expect(tabletop.orthographicProjection()).toBe(false);

      settings.patch({ enabled: true });

      // A screen laid flat under miniatures is always drawn without perspective.
      expect(tabletop.orthographicProjection()).toBe(true);
    });

    it('has nothing to offer until the screen has been measured', () => {
      expect(component.isCalibrated()).toBe(false);
      expect(component.calibrationDpi()).toBeNull();
      expect(component.realSizeEnabled).toBe(false);
    });

    it('keeps real size on the device rather than on the table', () => {
      TestBed.inject(DisplayCalibrationService).calibrateFromCardRun(274, 1);

      component.realSizeEnabled = true;

      expect(component.realSizeEnabled).toBe(true);
      expect(component.calibrationDpi()).toBe(81);
    });

    it('reads and writes the same lock the two 2D menus carry', () => {
      const lock = TestBed.inject(ViewLockService);
      expect(component.viewLocked).toBe(false);

      component.viewLocked = true;

      expect(lock.locked()).toBe(true);

      // And it shows what the menus did, so neither way in contradicts the other.
      lock.set(false);
      expect(component.viewLocked).toBe(false);
    });

    it('moves the scale a step at a time once there is something to move', () => {
      const calibration = TestBed.inject(DisplayCalibrationService);
      calibration.calibrateFromCardRun(274, 1);
      const measured = calibration.pxPerMm() as number;

      component.nudgeScale(1);

      expect(calibration.pxPerMm()).toBeCloseTo(measured * 1.002, 6);
    });

    it('puts the screen back to never having been measured', () => {
      const calibration = TestBed.inject(DisplayCalibrationService);
      calibration.calibrateFromCardRun(274, 1);
      component.realSizeEnabled = true;

      component.resetCalibration();

      expect(calibration.isCalibrated()).toBe(false);
      expect(component.realSizeEnabled).toBe(false);
      expect(component.viewLocked).toBe(false);
    });
  });
});
