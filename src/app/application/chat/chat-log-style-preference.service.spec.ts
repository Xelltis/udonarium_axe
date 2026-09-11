import { TestBed } from '@angular/core/testing';
import {
  CHAT_LOG_STYLE_STORAGE_KEY,
  ChatLogStylePreferenceService,
} from '@axe/application/chat/chat-log-style-preference.service';

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
    localStorage.setItem(CHAT_LOG_STYLE_STORAGE_KEY, 'vaporwave');

    expect(TestBed.inject(ChatLogStylePreferenceService).style()).toBe('standard');
  });
});
