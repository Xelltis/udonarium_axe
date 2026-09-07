import { Injector, ViewContainerRef } from '@angular/core';
import { inject, TestBed } from '@angular/core/testing';
import { ModalService } from '@axe/application/ui/modal.service';

describe('ModalService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ModalService],
    });
  });

  it('should ...', inject([ModalService], (service: ModalService) => {
    expect(service).toBeTruthy();
  }));

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
