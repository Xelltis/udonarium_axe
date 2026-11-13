import { TestBed } from '@angular/core/testing';
import { TurnFocusPreferenceService } from '@axe/application/ui/turn-focus-preference.service';
import { afterEach, describe, expect, it } from 'vitest';

describe('TurnFocusPreferenceService', () => {
  afterEach(() => localStorage.removeItem('ui-turn-focus'));

  function service(): TurnFocusPreferenceService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    return TestBed.inject(TurnFocusPreferenceService);
  }

  it('glides to every turn until the reader says otherwise', () => {
    expect(service().setting()).toBe('all');
  });

  it('moves on through one’s own turns alone and none, and back, remembering the choice', () => {
    const first = service();
    first.cycle();
    expect(first.setting()).toBe('own');
    expect(service().setting()).toBe('own');

    const second = service();
    second.cycle();
    expect(second.setting()).toBe('none');
    second.cycle();
    expect(second.setting()).toBe('all');
  });

  it('reads a setting it has never heard of as every turn', () => {
    localStorage.setItem('ui-turn-focus', 'sometimes');
    expect(service().setting()).toBe('all');
  });
});
