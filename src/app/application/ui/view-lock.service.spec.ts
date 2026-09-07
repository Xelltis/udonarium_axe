import { TestBed } from '@angular/core/testing';
import { ViewLockService } from '@axe/application/ui/view-lock.service';

describe('ViewLockService', () => {
  function service(): ViewLockService {
    TestBed.resetTestingModule();
    return TestBed.inject(ViewLockService);
  }

  it('leaves the table free to move until somebody locks it', () => {
    expect(service().locked()).toBe(false);
  });

  it('turns the lock on and off again', () => {
    const lock = service();

    lock.toggle();
    expect(lock.locked()).toBe(true);

    lock.toggle();
    expect(lock.locked()).toBe(false);
  });

  it('starts every session unlocked, since a board that comes back locked looks broken', () => {
    const first = service();
    first.set(true);

    expect(service().locked()).toBe(false);
  });

  it('leaves no trace in the browser', () => {
    service().set(true);

    expect(localStorage.getItem('ui-view-lock')).toBeNull();
  });
});
