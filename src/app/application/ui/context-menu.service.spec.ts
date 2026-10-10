import { ViewContainerRef } from '@angular/core';
import { inject, TestBed } from '@angular/core/testing';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';

describe('ContextMenuService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ContextMenuService],
    });
  });

  afterEach(() => {
    ContextMenuService.FourWayRadialMenuComponentClass = null;
    ContextMenuService.loadFourWayRadialMenuComponent = null;
  });

  it('should ...', inject([ContextMenuService], (service: ContextMenuService) => {
    expect(service).toBeTruthy();
  }));

  describe('a guest', () => {
    /** A place to put a menu that only records that one was asked for. */
    function placeForMenus(): { createComponent: ReturnType<typeof vi.fn> } {
      return {
        createComponent: vi.fn(() => {
          throw new Error('menu asked for');
        }),
      };
    }

    beforeEach(() => {
      vi.spyOn(TestBed.inject(RolePermissionService), 'canEditTabletop', 'get').mockReturnValue(false);
    });

    afterEach(() => vi.restoreAllMocks());

    it('is opened no ordinary menu', () => {
      const place = placeForMenus();

      TestBed.inject(ContextMenuService).open({ x: 1, y: 1 }, [{ name: 'a' }], undefined, {
        parentViewContainerRef: place as unknown as ViewContainerRef,
      });

      expect(place.createComponent).not.toHaveBeenCalled();
    });

    it('is opened a menu that says it is fit for a guest', () => {
      const place = placeForMenus();

      expect(() =>
        TestBed.inject(ContextMenuService).open({ x: 1, y: 1 }, [{ name: 'a' }], undefined, {
          parentViewContainerRef: place as unknown as ViewContainerRef,
          forGuests: true,
        })
      ).toThrow('menu asked for');
      expect(place.createComponent).toHaveBeenCalledOnce();
    });
  });

  describe('the four-way menu', () => {
    class FourWayMenuStub {}

    function openingWith(service: ContextMenuService): ReturnType<typeof vi.fn> {
      return vi
        .spyOn(service as unknown as { openComponent: (...args: unknown[]) => void }, 'openComponent')
        .mockImplementation(() => undefined);
    }

    it('is fetched the first time it is asked for, and kept for the next', async () => {
      const service = TestBed.inject(ContextMenuService);
      const opened = openingWith(service);
      const load = vi.fn(() => Promise.resolve(FourWayMenuStub));
      ContextMenuService.loadFourWayRadialMenuComponent = load;

      service.openRadial({ x: 10, y: 20 }, [], []);
      expect(opened).not.toHaveBeenCalled();
      await Promise.resolve();
      await Promise.resolve();

      expect(load).toHaveBeenCalledTimes(1);
      expect(opened).toHaveBeenCalledTimes(1);
      expect(opened.mock.calls[0][0]).toBe(FourWayMenuStub);

      service.openRadial({ x: 10, y: 20 }, [], []);

      expect(load).toHaveBeenCalledTimes(1);
      expect(opened).toHaveBeenCalledTimes(2);
    });

    it('opens at once where the menu is already here', () => {
      const service = TestBed.inject(ContextMenuService);
      const opened = openingWith(service);
      ContextMenuService.FourWayRadialMenuComponentClass = FourWayMenuStub;

      service.openRadial({ x: 10, y: 20 }, [], []);

      expect(opened).toHaveBeenCalledTimes(1);
    });
  });
});
