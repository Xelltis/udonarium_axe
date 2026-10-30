import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ChatTextField } from '@axe/features/chat/chat-input/chat-text-field';
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
});
