import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChatLineEditorComponent } from '@axe/features/chat/chat-line-editor/chat-line-editor.component';
import { StampPickerService } from '@axe/features/chat/stamp/stamp-picker.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('ChatLineEditorComponent', () => {
  let fixture: ComponentFixture<ChatLineEditorComponent>;
  let kept: number;
  let abandoned: number;
  let drafts: string[];

  const box = () => (fixture.nativeElement as HTMLElement).querySelector<HTMLTextAreaElement>('textarea')!;

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [ChatLineEditorComponent], providers: [...TEST_PROVIDERS] });
    fixture = TestBed.createComponent(ChatLineEditorComponent);
    fixture.componentRef.setInput('draft', 'こんばんは');
    kept = 0;
    abandoned = 0;
    drafts = [];
    fixture.componentInstance.kept.subscribe(() => kept++);
    fixture.componentInstance.abandoned.subscribe(() => abandoned++);
    fixture.componentInstance.draftChange.subscribe((draft) => drafts.push(draft));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('starts from what the line says, the caret at its end, in a box marked apart from the chat input', () => {
    expect(box().value).toBe('こんばんは');
    expect(box().hasAttribute('data-chat-line-edit')).toBe(true);
    expect(box().hasAttribute('data-chat-input')).toBe(false);
    expect(document.activeElement).toBe(box());
    expect(box().selectionStart).toBe('こんばんは'.length);
  });

  it('keeps the edit on Enter and puts it down on Escape, leaving Shift+Enter and composition to type', () => {
    box().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true }));
    box().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true }));
    expect([kept, abandoned]).toEqual([0, 0]);

    box().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    box().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect([kept, abandoned]).toEqual([1, 1]);
  });

  it('tells what is typed as the draft', () => {
    box().value = 'こんにちは';
    box().dispatchEvent(new Event('input'));
    expect(drafts.at(-1)).toBe('こんにちは');
  });

  it('offers the formatting buttons and the stamps, and no syntax to put in', async () => {
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="chat-toolbar-bold"]')).not.toBeNull();
    });
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[data-testid="chat-toolbar-ruby"]')).not.toBeNull();
    expect(element.querySelector('[data-testid^="chat-toolbar-group-"]')).toBeNull();
    expect(element.querySelector('[data-testid="chat-line-edit-stamp"]')).not.toBeNull();
  });

  it('puts the stamp picked in at the caret, as the draft', () => {
    const toggle = vi.spyOn(TestBed.inject(StampPickerService), 'toggle').mockImplementation(() => undefined);
    box().setSelectionRange(2, 2);
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-testid="chat-line-edit-stamp"]')!
      .click();
    toggle.mock.calls[0][2]('seal:ok');

    expect(box().value).toMatch(/^こん［.+:seal:ok］ばんは$/);
    expect(drafts.at(-1)).toBe(box().value);
  });
});
