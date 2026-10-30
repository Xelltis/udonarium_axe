import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type ChatTextField, TextareaChatField } from '@axe/features/chat/chat-input/chat-text-field';
import { ChatToolbarComponent } from '@axe/features/chat/chat-toolbar/chat-toolbar.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('ChatToolbarComponent', () => {
  const shown = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'showPopover');
  const hidden = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'hidePopover');

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ChatToolbarComponent], providers: [...TEST_PROVIDERS] });
    Object.defineProperty(HTMLElement.prototype, 'showPopover', { value: () => undefined, configurable: true });
    Object.defineProperty(HTMLElement.prototype, 'hidePopover', { value: () => undefined, configurable: true });
  });

  afterEach(() => {
    for (const [name, kept] of [
      ['showPopover', shown],
      ['hidePopover', hidden],
    ] as const) {
      if (kept) Object.defineProperty(HTMLElement.prototype, name, kept);
      else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[name];
    }
  });

  function opened(rich: boolean): HTMLElement {
    const field = { rich, activeMarks: signal(null).asReadonly() } as unknown as ChatTextField;
    const fixture = TestBed.createComponent(ChatToolbarComponent);
    fixture.componentRef.setInput('field', field);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('[data-testid="chat-toolbar-style"]')!.click();
    fixture.detectChanges();
    return root;
  }

  const offered = (root: HTMLElement) =>
    ['size-normal', 'font-normal', 'color-clear'].filter((key) =>
      root.querySelector(`[data-testid="chat-toolbar-${key}"]`)
    );

  it('offers to take the size, the font and the colour off in the editor', () => {
    expect(offered(opened(true))).toEqual(['size-normal', 'font-normal', 'color-clear']);
  });

  it('offers none of that in the plain box, where it would do nothing', () => {
    expect(offered(opened(false))).toEqual([]);
  });

  it('gives the keys back to the plain box once a ruby is put in from the reading', () => {
    const box = document.createElement('textarea');
    document.body.append(box);
    try {
      box.value = '漢字';
      box.setSelectionRange(0, 2);
      const fixture = TestBed.createComponent(ChatToolbarComponent);
      fixture.componentRef.setInput('field', new TextareaChatField(box));
      fixture.detectChanges();
      (fixture.nativeElement as HTMLElement)
        .querySelector<HTMLButtonElement>('[data-testid="chat-toolbar-ruby"]')!
        .click();
      fixture.detectChanges();
      const reading = document.querySelector<HTMLInputElement>('[data-testid="chat-toolbar-ruby-reading"]')!;
      reading.focus();
      reading.value = 'かんじ';
      reading.dispatchEvent(new Event('input'));
      reading.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

      expect(box.value).toBe('|漢字《かんじ》');
      expect(document.activeElement).toBe(box);
    } finally {
      box.remove();
    }
  });
});
