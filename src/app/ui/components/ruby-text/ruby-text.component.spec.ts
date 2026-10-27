import { TestBed } from '@angular/core/testing';
import { RubyTextComponent } from '@axe/ui/components/ruby-text/ruby-text.component';
import { RubyPart } from '@axe/ui/text-decoration/decorate-chat-text';

describe('RubyTextComponent', () => {
  function render(parts: readonly RubyPart[]): HTMLElement {
    const fixture = TestBed.createComponent(RubyTextComponent);
    fixture.componentRef.setInput('parts', parts);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('writes the reading over the word that has one', () => {
    const host = render([
      { text: '今日の', reading: '', decoration: null },
      { text: '天気', reading: 'てんき', decoration: null },
    ]);
    const ruby = host.querySelector('ruby.chat-ruby');
    expect(ruby?.querySelector('rb')?.textContent).toBe('天気');
    expect(ruby?.querySelector('rt')?.textContent).toBe('てんき');
  });

  it('adds nothing between the runs', () => {
    const host = render([
      { text: 'あ', reading: '', decoration: null },
      { text: '漢字', reading: 'かんじ', decoration: null },
      { text: 'い', reading: '', decoration: null },
    ]);
    expect(host.textContent).toBe('あ漢字かんじい');
  });

  it('draws a run with the chat’s decorations in their classes and colour, a run with a reading too', () => {
    const decoration = {
      bold: true,
      italic: false,
      strike: false,
      size: 'large',
      font: 'mincho',
      color: '#e5484d',
    } as const;
    const host = render([
      { text: '春', reading: '', decoration },
      { text: '曙', reading: 'あけぼの', decoration },
      { text: 'だ', reading: '', decoration: null },
    ]);
    const [span, plain] = Array.from(host.querySelectorAll('span'));
    expect([...span.classList].sort()).toEqual(['chat-deco', 'chat-deco-bold', 'chat-font-mincho', 'chat-size-large']);
    expect(span.style.color).toBe('#e5484d');
    const ruby = host.querySelector('ruby')!;
    expect(ruby.classList.contains('chat-ruby')).toBe(true);
    expect(ruby.classList.contains('chat-font-mincho')).toBe(true);
    expect(plain.className).toBe('');
    expect(plain.getAttribute('style')).toBeNull();
  });

  it('shows markup in the text as text', () => {
    const host = render([{ text: '<b>bold</b>', reading: '<i>x</i>', decoration: null }]);
    expect(host.querySelector('b')).toBeNull();
    expect(host.querySelector('i')).toBeNull();
    expect(host.querySelector('rb')?.textContent).toBe('<b>bold</b>');
  });
});
