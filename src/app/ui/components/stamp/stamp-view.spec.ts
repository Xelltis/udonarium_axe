import type { TranslateFn } from '@axe/application/i18n/translate.token';
import { SEAL_FILTER_ID } from '@axe/domain/chat/stamp-glyphs';
import { stampMarkup, stampViewOf, StampViewSource } from '@axe/ui/components/stamp/stamp-view';

const t = ((key: string, params?: Record<string, unknown>) =>
  params?.['words'] !== undefined ? `［${String(params['words'])}］` : key) as TranslateFn;

function source(pictures: Record<string, { url: string; name: string }> = {}): StampViewSource {
  return {
    t,
    picture: (imageIdentifier) => pictures[imageIdentifier] ?? null,
    nameInSet: (imageIdentifier) => (imageIdentifier === 'named' ? '<名前>' : ''),
  };
}

describe('stamp markup', () => {
  it('writes a sound effect as its words, as tall as the letters round it in a line', () => {
    const view = stampViewOf('sfx:boom', source())!;
    const html = stampMarkup('sfx:boom', view, 'inline');
    expect(view.kind).toBe('words');
    expect(html).toContain('data-stamp-id="sfx:boom"');
    expect(html).toContain('height:1.5em');
    expect(html).toContain('font-size:1.1em');
  });

  it('gives each seal written out a filter of its own', () => {
    const view = stampViewOf('seal:ok', source())!;
    const first = stampMarkup('seal:ok', view, 'inline');
    const second = stampMarkup('seal:ok', view, 64);
    const idOf = (html: string) => new RegExp(`id="(${SEAL_FILTER_ID}-line-\\d+)"`).exec(html)?.[1];
    expect(idOf(first)).toBeTruthy();
    expect(idOf(second)).toBeTruthy();
    expect(idOf(first)).not.toBe(idOf(second));
    expect(second).toContain('height:64px');
  });

  it('draws a room picture once it is here, escaping its address and name', () => {
    const view = stampViewOf('image:named', source({ named: { url: 'blob:x?a=1&b="2"', name: 'file' } }))!;
    const html = stampMarkup('image:named', view, 'inline');
    expect(html).toContain('src="blob:x?a=1&amp;b=&quot;2&quot;"');
    expect(html).toContain('alt="&lt;名前&gt;"');
  });

  it('writes the name of a room picture that is not here yet, in grey', () => {
    const view = stampViewOf('image:named', source())!;
    expect(view).toEqual(expect.objectContaining({ kind: 'words', words: '［<名前>］', color: '#8a8f99' }));
    expect(stampMarkup('image:named', view, 'inline')).toContain('［&lt;名前&gt;］');
  });

  it('knows nothing of a stamp this version does not know', () => {
    expect(stampViewOf('sfx:fromthefuture', source())).toBeNull();
  });
});
