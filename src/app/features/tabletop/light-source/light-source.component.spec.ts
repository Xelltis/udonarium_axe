import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { PieceContextMenuService } from '@axe/application/ui/piece-context-menu.service';
import { TabletopDisplaySettingsService } from '@axe/application/ui/tabletop-display-settings.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { LightSource } from '@axe/domain/tabletop/light-source';
import { LightSourceComponent } from '@axe/features/tabletop/light-source/light-source.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('LightSourceComponent', () => {
  let component: LightSourceComponent;
  let fixture: ComponentFixture<LightSourceComponent>;
  let light: LightSource;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [LightSourceComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(LightSourceComponent);
    component = fixture.componentInstance;
    light = LightSource.create('lantern');
    fixture.componentRef.setInput('lightSource', light);
  });

  afterEach(() => {
    fixture.destroy();
    light.destroy();
    vi.restoreAllMocks();
  });

  it('stands the picture on the middle of its cell, facing the camera', () => {
    TestBed.inject(UiSignalService).notifyTableViewRotation(50, 0, 45);

    expect(component.skinTransform()).toBe(
      'translateZ(25px) translateZ(0.00px) rotateZ(0deg) rotateZ(-45deg) rotateX(-50deg) rotateY(0deg)'
    );
  });

  it('lifts a light mounted up a wall by its altitude', () => {
    light.altitude = 1;

    expect(component.skinTransform()).toContain('translateZ(75px)');
  });

  describe('context menu display', () => {
    function openMenu(mode2d: boolean, radialMenuEnabled: boolean): void {
      const table = TestBed.inject(TabletopService).currentTable;
      table.mode2d = mode2d;
      TestBed.inject(TabletopDisplaySettingsService).patch({
        enabled: mode2d,
        radialMenuEnabled,
        radialMenuRotationSpeed: 9,
      });
      fixture.detectChanges();
      vi.spyOn(TestBed.inject(PieceContextMenuService), 'openForSelection').mockReturnValue(false);
      TestBed.inject(PointerDeviceService).primeForContextMenu(240, 180);

      component.onContextMenu(new Event('contextmenu', { cancelable: true }));
    }

    it.each([false, true])('uses the 2D menu interface with rotating display %s', (enabled) => {
      const menus = TestBed.inject(ContextMenuService);
      const openRadial = vi.spyOn(menus, 'openRadial').mockImplementation(() => undefined);
      const openOrdinary = vi.spyOn(menus, 'open').mockImplementation(() => undefined);
      openMenu(true, enabled);

      expect(openRadial).toHaveBeenCalledWith(
        expect.objectContaining({ x: 240, y: 180 }),
        expect.any(Array),
        expect.any(Array),
        'lantern',
        enabled,
        9,
        1
      );
      expect(openRadial.mock.calls[0]?.[2].map((group) => group.name)).toEqual([
        '光源・見た目',
        '位置・追従',
        'オブジェクト操作',
      ]);
      expect(openOrdinary).not.toHaveBeenCalled();
    });

    it('keeps the ordinary menu outside 2D mode', () => {
      const menus = TestBed.inject(ContextMenuService);
      const openRadial = vi.spyOn(menus, 'openRadial').mockImplementation(() => undefined);
      const openOrdinary = vi.spyOn(menus, 'open').mockImplementation(() => undefined);
      openMenu(false, true);

      expect(openOrdinary).toHaveBeenCalledWith(
        expect.objectContaining({ x: 240, y: 180 }),
        expect.any(Array),
        'lantern'
      );
      expect(openRadial).not.toHaveBeenCalled();
    });
  });
});
