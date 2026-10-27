import { TestBed } from '@angular/core/testing';
import { ActiveCharacterService } from '@axe/application/character/active-character.service';
import { beforeEach, describe, expect, it } from 'vitest';

describe('ActiveCharacterService', () => {
  let service: ActiveCharacterService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ActiveCharacterService);
  });

  it('starts with nothing to work on', () => {
    expect(service.identifier()).toBeNull();
    expect(service.isActive('a')).toBe(false);
  });

  it('takes something to work on', () => {
    service.select('a');
    expect(service.identifier()).toBe('a');
    expect(service.isActive('a')).toBe(true);
    expect(service.isActive('b')).toBe(false);
  });

  it('lets the same one go and moves to another', () => {
    service.toggle('a');
    expect(service.identifier()).toBe('a');

    service.toggle('a');
    expect(service.identifier()).toBeNull();

    service.toggle('a');
    service.toggle('b');
    expect(service.identifier()).toBe('b');
  });

  it('lets go on request', () => {
    service.select('a');
    service.clear();
    expect(service.identifier()).toBeNull();
  });
});
