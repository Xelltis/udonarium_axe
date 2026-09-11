import { TestBed } from '@angular/core/testing';
import {
  FIRST_PERSON_PIECE_STORAGE_KEY,
  FirstPersonPreferenceService,
} from '@axe/application/ui/first-person-preference.service';
import { vi } from 'vitest';

describe('FirstPersonPreferenceService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [FirstPersonPreferenceService] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  function reopen(): FirstPersonPreferenceService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [FirstPersonPreferenceService] });
    return TestBed.inject(FirstPersonPreferenceService);
  }

  it('looks out of no piece until somebody asks to', () => {
    expect(TestBed.inject(FirstPersonPreferenceService).piece()).toBe('');
  });

  it('remembers the piece for the next window', () => {
    TestBed.inject(FirstPersonPreferenceService).choose('piece-1');

    expect(reopen().piece()).toBe('piece-1');
  });

  it('forgets the piece once the seat goes back to the table', () => {
    const preference = TestBed.inject(FirstPersonPreferenceService);
    preference.choose('piece-1');

    preference.forget();

    expect(preference.piece()).toBe('');
    expect(localStorage.getItem(FIRST_PERSON_PIECE_STORAGE_KEY)).toBeNull();
    expect(reopen().piece()).toBe('');
  });

  it('reads a blank that was written down as no piece', () => {
    localStorage.setItem(FIRST_PERSON_PIECE_STORAGE_KEY, '   ');

    expect(TestBed.inject(FirstPersonPreferenceService).piece()).toBe('');
  });

  it('holds the choice for the session where the browser will not keep it', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('refused');
    });
    const preference = TestBed.inject(FirstPersonPreferenceService);

    preference.choose('piece-1');

    expect(preference.piece()).toBe('piece-1');
  });

  it('starts on no piece where the browser will not say what it kept', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('refused');
    });

    expect(TestBed.inject(FirstPersonPreferenceService).piece()).toBe('');
  });
});
