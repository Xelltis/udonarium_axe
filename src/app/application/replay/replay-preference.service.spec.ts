import { TestBed } from '@angular/core/testing';
import {
  DEFAULT_REPLAY_PREFERENCE,
  parseReplayPreference,
  ReplayPreferenceService,
} from '@axe/application/replay/replay-preference.service';
import { ReplayDetailLevel } from '@axe/domain/replay/replay-event';
import { refuseLocalStorage } from '@axe/testing/refused-storage';

const STORAGE_KEY = 'axe-replay-preference';

describe('parseReplayPreference()', () => {
  it('starts at the standard setting with nothing saved', () => {
    expect(parseReplayPreference(null)).toEqual(DEFAULT_REPLAY_PREFERENCE);
    // By default there is no limit, so nothing old is deleted unasked.
    expect(DEFAULT_REPLAY_PREFERENCE).toEqual({ detailLevel: ReplayDetailLevel.Notable, keepCount: null });
  });

  it('reads the saved choice', () => {
    expect(parseReplayPreference('{"detailLevel":"full"}')).toEqual({
      detailLevel: ReplayDetailLevel.Full,
      keepCount: null,
    });
    expect(parseReplayPreference('{"detailLevel":"full","keepCount":10}')).toEqual({
      detailLevel: ReplayDetailLevel.Full,
      keepCount: 10,
    });
    expect(parseReplayPreference('{"keepCount":0}').keepCount).toBeNull();
  });

  it('falls back to the default for a broken value', () => {
    expect(parseReplayPreference('{')).toEqual(DEFAULT_REPLAY_PREFERENCE);
    expect(parseReplayPreference('null')).toEqual(DEFAULT_REPLAY_PREFERENCE);
  });

  it('falls back to the default for a value it does not know', () => {
    expect(parseReplayPreference('{"detailLevel":"everything"}')).toEqual(DEFAULT_REPLAY_PREFERENCE);
  });

  it('fills in only the missing entries', () => {
    expect(parseReplayPreference('{}')).toEqual(DEFAULT_REPLAY_PREFERENCE);
  });
});

describe('ReplayPreferenceService', () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
    TestBed.resetTestingModule();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem(STORAGE_KEY);
  });

  it('starts at the standard setting', () => {
    expect(TestBed.inject(ReplayPreferenceService).detailLevel()).toBe(ReplayDetailLevel.Notable);
  });

  it('carries the chosen detail level to the next session', () => {
    TestBed.inject(ReplayPreferenceService).setDetailLevel(ReplayDetailLevel.Full);

    TestBed.resetTestingModule();
    expect(TestBed.inject(ReplayPreferenceService).detailLevel()).toBe(ReplayDetailLevel.Full);
  });

  it('still takes a choice where the browser refuses to keep it', () => {
    TestBed.resetTestingModule();
    refuseLocalStorage();
    const service = TestBed.inject(ReplayPreferenceService);

    service.setDetailLevel(ReplayDetailLevel.Full);
    expect(service.detailLevel()).toBe(ReplayDetailLevel.Full);
  });
});
