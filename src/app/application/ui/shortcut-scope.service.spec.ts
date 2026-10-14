import { DestroyRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ShortcutScopeService } from '@axe/application/ui/shortcut-scope.service';

describe('ShortcutScopeService', () => {
  function owner(): DestroyRef & { destroy(): void } {
    const callbacks: (() => void)[] = [];
    return {
      destroyed: false,
      onDestroy: (callback: () => void) => {
        callbacks.push(callback);
        return () => undefined;
      },
      destroy: () => callbacks.forEach((callback) => callback()),
    } as DestroyRef & { destroy(): void };
  }

  function service(): ShortcutScopeService {
    TestBed.resetTestingModule();
    return TestBed.inject(ShortcutScopeService);
  }

  it('holds nothing to begin with', () => {
    expect(service().scopes()).toEqual([]);
  });

  it('puts the latest editor first and lets it go when it is destroyed', () => {
    const scopes = service();
    const board = owner();
    const map = owner();

    scopes.hold('whiteBoard', board);
    scopes.hold('mapEditor', map);
    expect(scopes.scopes()).toEqual(['mapEditor', 'whiteBoard']);

    map.destroy();
    expect(scopes.scopes()).toEqual(['whiteBoard']);
  });

  it('keeps a scope while any of its editors is still open', () => {
    const scopes = service();
    const first = owner();
    const second = owner();

    scopes.hold('whiteBoard', first);
    scopes.hold('whiteBoard', second);
    expect(scopes.scopes()).toEqual(['whiteBoard']);

    first.destroy();
    expect(scopes.scopes()).toEqual(['whiteBoard']);
    second.destroy();
    expect(scopes.scopes()).toEqual([]);
  });
});
