import { formatNoteText } from '@axe/ui/text-decoration/format-note-text';

describe('a shared note drawn with formatting', () => {
  it('reads headings, lists and quotes from the marks that start their lines', () => {
    expect(formatNoteText('# 洞窟\n## 入口\n### 罠')).toBe('<h1>洞窟</h1><h2>入口</h2><h3>罠</h3>');
    expect(formatNoteText('- たいまつ\n- ロープ')).toBe('<ul><li>たいまつ</li><li>ロープ</li></ul>');
    expect(formatNoteText('1. 扉を調べる\n2. 開ける')).toBe('<ol><li>扉を調べる</li><li>開ける</li></ol>');
    expect(formatNoteText('> 古い碑文\n> 二行目')).toBe('<blockquote>古い碑文<br>二行目</blockquote>');
  });

  it('keeps a single break as a break, starts a paragraph at a blank line, and ends a list at the next plain line', () => {
    expect(formatNoteText('一行目\n二行目\n\n次の段落')).toBe('<p>一行目<br>二行目</p><p>次の段落</p>');
    expect(formatNoteText('- 一つ\nふつうの行')).toBe('<ul><li>一つ</li></ul><p>ふつうの行</p>');
  });

  it('keeps code as it was typed, in a line or a fenced block, with no ruby read inside it', () => {
    expect(formatNoteText('判定は `2d6+3` で')).toBe('<p>判定は <code>2d6+3</code> で</p>');
    expect(formatNoteText('```\n|炎《ほのお》\n  <b>\n```')).toBe('<pre><code>|炎《ほのお》\n  &lt;b&gt;</code></pre>');
  });

  it('gives a line its ruby, and leaves stars and underscores as they are', () => {
    expect(formatNoteText('|炎《ほのお》の剣')).toContain('<ruby class="chat-ruby"><rb>炎</rb><rt>ほのお</rt></ruby>');
    expect(formatNoteText('ダメージは 2*3_4')).toBe('<p>ダメージは 2*3_4</p>');
  });

  it('lets nothing written run or load anything', () => {
    const html = formatNoteText(
      '<script>alert(1)</script>\n<img src=x onerror=alert(1)>\n# <b>見出し</b>\n- javascript:alert(1)'
    );

    expect(html).not.toMatch(/<script|<img|<b>/);
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('href="javascript');
  });

  it('turns an address into a link outside code, and leaves one in code as text', () => {
    const html = formatNoteText('https://example.com\n`https://example.org`');

    expect(html).toContain('<a href="https://example.com" target="_blank" rel="noopener noreferrer">');
    expect(html).toContain('<code>https://example.org</code>');
  });

  it('shows what was typed, ampersands and brackets included, as text', () => {
    const box = document.createElement('div');
    box.innerHTML = formatNoteText('A & B <b>太字</b> &lt;');

    expect(box.textContent).toBe('A & B <b>太字</b> &lt;');
    expect(box.querySelector('b')).toBeNull();
  });
});
