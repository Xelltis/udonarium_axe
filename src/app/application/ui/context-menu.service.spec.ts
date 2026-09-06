import { inject, TestBed } from '@angular/core/testing';
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
