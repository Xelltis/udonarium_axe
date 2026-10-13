import { TestBed } from '@angular/core/testing';
import {
  CHAT_FONT_SIZE_DEFAULT,
  CHAT_FONT_SIZE_MAX,
  CHAT_FONT_SIZE_MIN,
  ChatPreferencesService,
} from '@axe/application/chat/chat-preferences.service';
import { DEFAULT_RUBY_DISPLAY } from '@axe/domain/chat/ruby-display';
import { AttachedDocuments } from '@axe/domain/ui/attached-documents';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('ChatPreferencesService', () => {
  function make(): ChatPreferencesService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    return TestBed.inject(ChatPreferencesService);
  }

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.style.removeProperty('--chat-font-size');
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('how the reader has ruby drawn', () => {
    const marks = (html: HTMLElement) =>
      ['show', 'align', 'spacing', 'size'].map((part) => html.getAttribute(`data-ruby-${part}`));

    it('draws ruby over the middle of its word, spread 1:2:1, until told otherwise', () => {
      const service = make();
      TestBed.tick();

      expect(service.rubyDisplay()).toEqual(DEFAULT_RUBY_DISPLAY);
      expect(marks(document.documentElement)).toEqual(['over', 'center', 'even', 'normal']);
    });

    it('keeps each part chosen for the next visit, and marks the page with it', () => {
      const service = make();
      service.setRubyDisplay({ align: 'start' });
      service.setRubyDisplay({ size: 'half' });
      TestBed.tick();

      expect(marks(document.documentElement)).toEqual(['over', 'start', 'even', 'half']);
      expect(make().rubyDisplay()).toEqual({ ...DEFAULT_RUBY_DISPLAY, align: 'start', size: 'half' });
    });

    it('marks a window a panel is taken out into as well', () => {
      const service = make();
      service.setRubyDisplay({ show: 'brackets' });
      TestBed.tick();
      const other = document.implementation.createHTMLDocument('panel');

      AttachedDocuments.attach(other);

      try {
        expect(marks(other.documentElement)[0]).toBe('brackets');
      } finally {
        AttachedDocuments.detach(other);
      }
    });
  });

  it('starts at the size the messages are drawn at', () => {
    expect(make().fontSize()).toBe(CHAT_FONT_SIZE_DEFAULT);
  });

  it('says nothing about the count of lines until it is asked to', () => {
    expect(make().showMessageCount()).toBe(false);
  });

  it('keeps being asked for the count of lines for the next visit', () => {
    const service = make();
    service.setShowMessageCount(true);
    TestBed.tick();

    expect(make().showMessageCount()).toBe(true);
  });

  it('keeps the size it was given for the next visit', () => {
    const service = make();
    service.setFontSize(18);
    TestBed.tick();

    expect(make().fontSize()).toBe(18);
  });

  it('holds a size typed past either end to what the panel offers', () => {
    const service = make();

    service.setFontSize(999);
    expect(service.fontSize()).toBe(CHAT_FONT_SIZE_MAX);

    service.setFontSize(1);
    expect(service.fontSize()).toBe(CHAT_FONT_SIZE_MIN);
  });

  it('hands the size to the stylesheet the messages read', () => {
    const service = make();
    service.setFontSize(20);
    TestBed.tick();

    expect(document.documentElement.style.getPropertyValue('--chat-font-size')).toBe('20px');
  });

  it('keeps the colours and the display settings for the next visit', () => {
    const service = make();
    service.setColors(['#111111', '#222222', '#333333']);
    service.setDisplay({
      portraitHeight: 320,
      isPortraitInWindow: true,
      isKeepPortraitOutWindow: false,
      simpleDispFlagTime: 1,
      simpleDispFlagUserId: 0,
    });
    TestBed.tick();

    const next = make();
    expect(next.colors()).toEqual(['#111111', '#222222', '#333333']);
    expect(next.display()?.portraitHeight).toBe(320);
    expect(next.display()?.isPortraitInWindow).toBe(true);
    expect(next.display()?.simpleDispFlagTime).toBe(1);
  });

  it('keeps what each tab was set to, under that tab', () => {
    const service = make();
    service.setTabPreferences('tab-a', { portraitDisplayFlag: 0, chatSimpleDispFlag: 1 });
    service.setTabPreferences('tab-b', { portraitDisplayFlag: 1, chatSimpleDispFlag: 0 });
    TestBed.tick();

    const next = make();
    expect(next.tabPreferencesOf('tab-a')).toEqual({ portraitDisplayFlag: 0, chatSimpleDispFlag: 1 });
    expect(next.tabPreferencesOf('tab-b')).toEqual({ portraitDisplayFlag: 1, chatSimpleDispFlag: 0 });
    expect(next.tabPreferencesOf('tab-c')).toBeNull();
  });

  it('lets go of the tabs it has not seen in a long while', () => {
    const service = make();
    for (let i = 0; i < 70; i++) {
      service.setTabPreferences(`tab-${i}`, { portraitDisplayFlag: 1, chatSimpleDispFlag: 0 });
    }

    expect(service.tabPreferencesOf('tab-0')).toBeNull();
    expect(service.tabPreferencesOf('tab-69')).not.toBeNull();
  });

  it('starts from the defaults when the stored settings cannot be read', () => {
    localStorage.setItem('chat-preferences', '{ not json');

    expect(make().fontSize()).toBe(CHAT_FONT_SIZE_DEFAULT);
  });
});
