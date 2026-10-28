import { Injector, ViewContainerRef } from '@angular/core';
import { inject, TestBed } from '@angular/core/testing';
import { ModalService } from '@axe/application/ui/modal.service';
import { LOAD_FAILURE_NOTICE, MODAL_FRAME_COMPONENT } from '@axe/application/ui/overlay-components';
import { Logger } from '@axe/core/logging/logger';

/** Stands for the frame; the specs hand the service a layer that makes their own. */
class FrameStub {}

describe('ModalService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ModalService, { provide: MODAL_FRAME_COMPONENT, useValue: FrameStub }],
    });
  });

  it('should ...', inject([ModalService], (service: ModalService) => {
    expect(service).toBeTruthy();
  }));

  describe('a dialog fetched on first use', () => {
    class Dialog {}

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('opens the dialog the way round it was asked for in, though it arrives later', async () => {
      const service = TestBed.inject(ModalService);
      const rotations: unknown[] = [];
      vi.spyOn(service, 'open').mockImplementation(async () => {
        rotations.push((service as unknown as { actionRotationDegrees: number }).actionRotationDegrees);
        return null;
      });

      await service.runWithInitialRotation(90, () => service.openLazy(() => Promise.resolve(Dialog)));

      expect(rotations).toEqual([90]);
    });

    it('opens the dialog once it arrives, answering as it answers', async () => {
      const service = TestBed.inject(ModalService);
      const open = vi.spyOn(service, 'open').mockResolvedValue('answer');

      const answer = await service.openLazy<string>(() => Promise.resolve(Dialog), { width: 3 });

      expect(open).toHaveBeenCalledWith(Dialog, { width: 3 }, undefined);
      expect(answer).toBe('answer');
    });

    it('says the page wants reloading where the dialog cannot be fetched, and opens nothing', async () => {
      const told = vi.fn();
      TestBed.overrideProvider(LOAD_FAILURE_NOTICE, { useValue: told });
      const service = TestBed.inject(ModalService);
      const open = vi.spyOn(service, 'open');
      vi.spyOn(Logger, 'error').mockImplementation(() => undefined);

      const answer = await service.openLazy(() => Promise.reject(new Error('chunk gone')));

      expect(answer).toBeNull();
      expect(told).toHaveBeenCalledOnce();
      expect(open).not.toHaveBeenCalled();
    });
  });

  describe('title signal', () => {
    it('starts empty', inject([ModalService], (service: ModalService) => {
      expect(service.title).toBe('');
    }));

    it('takes a new value from the setter', inject([ModalService], (service: ModalService) => {
      service.title = 'テストモーダル';
      expect(service.title).toBe('テストモーダル');
    }));
  });

  describe('open lifecycle', () => {
    it('passes an action direction to the modal it opens', async () => {
      const service = TestBed.inject(ModalService);
      const rootInjector = TestBed.inject(Injector);
      let destroyCallback: (() => void) | undefined;
      let childInjector: Injector | undefined;
      const panelComponentRef = {
        instance: { content: () => ({ createComponent: () => ({ instance: {} }) }) },
        destroy: () => destroyCallback?.(),
        onDestroy: (callback: () => void) => (destroyCallback = callback),
      };
      const parentViewContainerRef = {
        injector: rootInjector,
        length: 0,
        createComponent: (_component: unknown, options: { injector: Injector }) => {
          childInjector = options.injector;
          return panelComponentRef;
        },
      } as unknown as ViewContainerRef;

      const promise = service.runWithInitialRotation(270, () =>
        service.open(class {}, undefined, parentViewContainerRef)
      );
      const childService = childInjector!.get(ModalService);
      expect(childService.rotationDegrees()).toBe(270);

      childService.resolve('done');
      await expect(promise).resolves.toBe('done');
    });

    it('shows again after resolving, since the count is only decremented once', async () => {
      const service = TestBed.inject(ModalService);
      const rootInjector = TestBed.inject(Injector);

      let destroyCallback: (() => void) | undefined;
      let childInjector: Injector | undefined;

      const panelComponentRef = {
        instance: {
          content: () => ({
            createComponent: () => ({ instance: {} }),
          }),
        },
        destroy: () => {
          destroyCallback?.();
        },
        onDestroy: (cb: () => void) => {
          destroyCallback = cb;
        },
      };

      const parentViewContainerRef = {
        injector: rootInjector,
        length: 0,
        createComponent: (_component: unknown, options: { injector: Injector }) => {
          childInjector = options.injector;
          return panelComponentRef;
        },
      } as unknown as ViewContainerRef;

      const firstPromise = service.open<{ ok: boolean }>(class {}, { title: 'first' }, parentViewContainerRef);
      expect(service.isShow).toBe(true);

      const firstChildService = childInjector!.get(ModalService);
      firstChildService.resolve({ ok: true });
      await expect(firstPromise).resolves.toEqual({ ok: true });
      expect(service.isShow).toBe(false);

      const secondPromise = service.open<{ ok: boolean }>(class {}, { title: 'second' }, parentViewContainerRef);
      expect(service.isShow).toBe(true);

      const secondChildService = childInjector!.get(ModalService);
      secondChildService.resolve({ ok: true });
      await expect(secondPromise).resolves.toEqual({ ok: true });
      expect(service.isShow).toBe(false);
    });

    /**
     * A dialogue opened in a window of its own goes when that window does, without anyone
     * answering it. Whoever is waiting has to be let go of, or they wait for ever — and with
     * the same answer a dismissal gives, since that is the one every caller reads for.
     */
    it('answers a caller whose dialogue was taken away, as a dismissal would', async () => {
      const service = TestBed.inject(ModalService);
      const rootInjector = TestBed.inject(Injector);
      let destroyCallback: (() => void) | undefined;

      const panelComponentRef = {
        instance: { content: () => ({ createComponent: () => ({ instance: {} }) }) },
        destroy: () => destroyCallback?.(),
        onDestroy: (cb: () => void) => (destroyCallback = cb),
      };
      const parentViewContainerRef = {
        injector: rootInjector,
        length: 0,
        createComponent: () => panelComponentRef,
      } as unknown as ViewContainerRef;

      const waiting = service.open(class {}, { title: 'taken away' }, parentViewContainerRef);
      expect(service.isShow).toBe(true);

      panelComponentRef.destroy();

      await expect(waiting).resolves.toBeNull();
      expect(service.isShow).toBe(false);
    });

    it('shows again after rejecting, since the count is only decremented once', async () => {
      const service = TestBed.inject(ModalService);
      const rootInjector = TestBed.inject(Injector);

      let destroyCallback: (() => void) | undefined;
      let childInjector: Injector | undefined;

      const panelComponentRef = {
        instance: {
          content: () => ({
            createComponent: () => ({ instance: {} }),
          }),
        },
        destroy: () => {
          destroyCallback?.();
        },
        onDestroy: (cb: () => void) => {
          destroyCallback = cb;
        },
      };

      const parentViewContainerRef = {
        injector: rootInjector,
        length: 0,
        createComponent: (_component: unknown, options: { injector: Injector }) => {
          childInjector = options.injector;
          return panelComponentRef;
        },
      } as unknown as ViewContainerRef;

      const firstPromise = service.open(class {}, { title: 'first' }, parentViewContainerRef);
      expect(service.isShow).toBe(true);

      const firstChildService = childInjector!.get(ModalService);
      firstChildService.reject('ng');
      await expect(firstPromise).rejects.toBe('ng');
      expect(service.isShow).toBe(false);

      const secondPromise = service.open(class {}, { title: 'second' }, parentViewContainerRef);
      expect(service.isShow).toBe(true);

      const secondChildService = childInjector!.get(ModalService);
      secondChildService.reject('ng2');
      await expect(secondPromise).rejects.toBe('ng2');
      expect(service.isShow).toBe(false);
    });
  });
});
