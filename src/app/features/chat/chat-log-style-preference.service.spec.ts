import { TestBed } from '@angular/core/testing';
import { STORAGE_KEYS } from '@axe/core/storage/storage-keys';
import { ChatLogStylePreferenceService } from '@axe/features/chat/chat-log-style-preference.service';

describe('ChatLogStylePreferenceService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [ChatLogStylePreferenceService] });
  });

  afterEach(() => localStorage.clear());

  it('writes the standard log until somebody picks another', () => {
    expect(TestBed.inject(ChatLogStylePreferenceService).style()).toBe('standard');
  });

  it('remembers the choice for the next window', () => {
    TestBed.inject(ChatLogStylePreferenceService).choose('neon');

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [ChatLogStylePreferenceService] });

    expect(TestBed.inject(ChatLogStylePreferenceService).style()).toBe('neon');
  });

  it('reads a style it does not know as the standard one', () => {
    localStorage.setItem(STORAGE_KEYS.chatLogStyle, 'vaporwave');

    expect(TestBed.inject(ChatLogStylePreferenceService).style()).toBe('standard');
  });

  describe('leaving deleted lines out of saved logs', () => {
    it('keeps them in until somebody asks otherwise', () => {
      expect(TestBed.inject(ChatLogStylePreferenceService).omitDeleted()).toBe(false);
    });

    it('remembers the choice for the next window, as text', () => {
      TestBed.inject(ChatLogStylePreferenceService).setOmitDeleted(true);
      expect(localStorage.getItem(STORAGE_KEYS.chatLogOmitDeleted)).toBe('true');

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [ChatLogStylePreferenceService] });

      expect(TestBed.inject(ChatLogStylePreferenceService).omitDeleted()).toBe(true);
    });

    it('reads anything but true as keeping them in', () => {
      localStorage.setItem(STORAGE_KEYS.chatLogOmitDeleted, '1');

      expect(TestBed.inject(ChatLogStylePreferenceService).omitDeleted()).toBe(false);
    });
  });
});
