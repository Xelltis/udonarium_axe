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
      { text: '今日の', reading: '' },
      { text: '天気', reading: 'てんき' },
    ]);
    const ruby = host.querySelector('ruby.chat-ruby');
    expect(ruby?.querySelector('rb')?.textContent).toBe('天気');
    expect(ruby?.querySelector('rt')?.textContent).toBe('てんき');
  });

  it('adds nothing between the runs', () => {
    const host = render([
      { text: 'あ', reading: '' },
      { text: '漢字', reading: 'かんじ' },
      { text: 'い', reading: '' },
    ]);
    expect(host.textContent).toBe('あ漢字かんじい');
  });

  it('shows markup in the text as text', () => {
    const host = render([{ text: '<b>bold</b>', reading: '<i>x</i>' }]);
    expect(host.querySelector('b')).toBeNull();
    expect(host.querySelector('i')).toBeNull();
    expect(host.querySelector('rb')?.textContent).toBe('<b>bold</b>');
  });
});
