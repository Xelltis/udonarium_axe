import { DEFAULT_RUBY_DISPLAY, readRubyDisplay, rubyDisplayCss } from '@axe/domain/chat/ruby-display';

describe('how a reader has ruby drawn', () => {
  it('reads what was stored, any part missing or not understood as the default', () => {
    expect(readRubyDisplay(undefined)).toEqual(DEFAULT_RUBY_DISPLAY);
    expect(readRubyDisplay({ align: 'start', size: 'huge', show: 3 })).toEqual({
      ...DEFAULT_RUBY_DISPLAY,
      align: 'start',
    });
  });

  it('spreads the shorter of a word and its reading 1:2:1 over the middle unless told otherwise', () => {
    expect(rubyDisplayCss(DEFAULT_RUBY_DISPLAY)).toContain('ruby-align:space-around');
    expect(rubyDisplayCss({ ...DEFAULT_RUBY_DISPLAY, spacing: 'tight' })).toContain('ruby-align:center');
  });

  it('keeps a reading to the first letter of its word whatever the spacing', () => {
    expect(rubyDisplayCss({ ...DEFAULT_RUBY_DISPLAY, align: 'start', spacing: 'tight' })).toContain('ruby-align:start');
  });

  it('draws a reading in brackets after its word, or not at all', () => {
    const brackets = rubyDisplayCss({ ...DEFAULT_RUBY_DISPLAY, show: 'brackets' });
    expect(brackets).toContain('content:"（"');
    expect(brackets).toContain(':empty::before');
    expect(rubyDisplayCss({ ...DEFAULT_RUBY_DISPLAY, show: 'hidden' })).toBe('ruby.chat-ruby rt{display:none}');
  });
});
