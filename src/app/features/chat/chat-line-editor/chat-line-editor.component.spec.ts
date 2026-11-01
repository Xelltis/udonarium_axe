import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { ChatLintSession } from '@axe/application/chat/chat-lint.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { CHAT_EDITOR_LOADER, type ChatEditorModule } from '@axe/features/chat/chat-editor/chat-editor-loader';
import { ChatLineEditorComponent } from '@axe/features/chat/chat-line-editor/chat-line-editor.component';
import { StampPickerService } from '@axe/features/chat/stamp/stamp-picker.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { TranslocoService } from '@jsverse/transloco';

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

  it('neither keeps nor puts down a passage written at length, where Enter starts a new line', () => {
    fixture.componentRef.setInput('enterKeeps', false);
    fixture.componentRef.setInput('placeholder', '本文');
    fixture.detectChanges();

    box().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
    box().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));

    expect([kept, abandoned]).toEqual([0, 0]);
    expect(box().getAttribute('placeholder')).toBe('本文');
  });

  it('says nothing of a decoration round a roll, as a line rewritten runs its commands no more', () => {
    fixture.componentRef.setInput('draft', '**2d6 攻撃**');
    fixture.detectChanges();
    const session = (fixture.componentInstance as unknown as { session: ChatLintSession }).session;

    expect(session.diagnostics().map((found) => found.code)).not.toContain('deco.hidesCommand');
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

describe('ChatLineEditorComponent handing its plain box over to the editor', () => {
  it('puts the editor in where the caret stood, as it arrives while the line is written', async () => {
    let arrive!: (module: ChatEditorModule | null) => void;
    const mounted = vi.fn(() => ({
      parent: null,
      text: () => 'こんばんは',
      selection: () => ({ from: 0, to: 0 }),
      refresh: vi.fn(),
      refreshSoon: vi.fn(),
      followRoot: vi.fn(),
      destroy: vi.fn(),
      focus: vi.fn(),
      hasFocus: () => false,
      activeMarks: () => null,
      reconfigure: vi.fn(),
    }));
    TestBed.configureTestingModule({
      imports: [ChatLineEditorComponent],
      providers: [
        ...TEST_PROVIDERS,
        {
          provide: CHAT_EDITOR_LOADER,
          useValue: () =>
            new Promise<ChatEditorModule | null>((resolve) => {
              arrive = resolve;
            }),
        },
      ],
    });
    const fixture = TestBed.createComponent(ChatLineEditorComponent);
    fixture.componentRef.setInput('draft', 'こんばんは');
    fixture.detectChanges();
    await fixture.whenStable();
    const area = (fixture.nativeElement as HTMLElement).querySelector<HTMLTextAreaElement>('textarea')!;
    area.focus();
    area.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    area.setSelectionRange(1, 2);

    arrive({ mountChatEditor: mounted } as unknown as ChatEditorModule);
    await fixture.whenStable();
    fixture.detectChanges();
    TestBed.tick();

    expect(mounted).toHaveBeenCalledWith(
      expect.anything(),
      { text: 'こんばんは', selection: { from: 1, to: 2 }, focused: true },
      expect.anything()
    );
  });

  it('leaves the keys where the reader took them, after using the box', async () => {
    let arrive!: (module: ChatEditorModule | null) => void;
    const mounted = vi.fn(() => ({
      parent: null,
      text: () => 'こんばんは',
      selection: () => ({ from: 0, to: 0 }),
      refresh: vi.fn(),
      refreshSoon: vi.fn(),
      followRoot: vi.fn(),
      destroy: vi.fn(),
      focus: vi.fn(),
      hasFocus: () => false,
      activeMarks: () => null,
      reconfigure: vi.fn(),
    }));
    TestBed.configureTestingModule({
      imports: [ChatLineEditorComponent],
      providers: [
        ...TEST_PROVIDERS,
        {
          provide: CHAT_EDITOR_LOADER,
          useValue: () =>
            new Promise<ChatEditorModule | null>((resolve) => {
              arrive = resolve;
            }),
        },
      ],
    });
    const fixture = TestBed.createComponent(ChatLineEditorComponent);
    fixture.componentRef.setInput('draft', 'こんばんは');
    fixture.detectChanges();
    await fixture.whenStable();
    const area = (fixture.nativeElement as HTMLElement).querySelector<HTMLTextAreaElement>('textarea')!;
    area.focus();
    area.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    area.setSelectionRange(2, 2);
    area.blur();

    arrive({ mountChatEditor: mounted } as unknown as ChatEditorModule);
    await fixture.whenStable();
    fixture.detectChanges();
    TestBed.tick();

    expect(mounted).toHaveBeenCalledWith(
      expect.anything(),
      { text: 'こんばんは', selection: { from: 2, to: 2 }, focused: false },
      expect.anything()
    );
  });
  describe('arriving before the box is put to use', () => {
    let arrive!: (module: ChatEditorModule | null) => void;
    let mounted: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mounted = vi.fn(() => ({
        parent: null,
        text: () => 'こんばんは',
        selection: () => ({ from: 0, to: 0 }),
        refresh: vi.fn(),
        refreshSoon: vi.fn(),
        followRoot: vi.fn(),
        destroy: vi.fn(),
        focus: vi.fn(),
        hasFocus: () => false,
        activeMarks: () => null,
        reconfigure: vi.fn(),
      }));
      TestBed.configureTestingModule({
        imports: [ChatLineEditorComponent],
        providers: [
          ...TEST_PROVIDERS,
          {
            provide: CHAT_EDITOR_LOADER,
            useValue: () =>
              new Promise<ChatEditorModule | null>((resolve) => {
                arrive = resolve;
              }),
          },
        ],
      });
    });

    async function openAndArrive(before?: () => void) {
      const fixture = TestBed.createComponent(ChatLineEditorComponent);
      fixture.componentRef.setInput('draft', 'こんばんは');
      fixture.detectChanges();
      await fixture.whenStable();
      before?.();
      arrive({ mountChatEditor: mounted } as unknown as ChatEditorModule);
      await fixture.whenStable();
      fixture.detectChanges();
      TestBed.tick();
    }

    it('takes the keys the box was given as the line opened', async () => {
      await openAndArrive();

      expect(mounted).toHaveBeenCalledWith(
        expect.anything(),
        { text: 'こんばんは', selection: { from: 5, to: 5 }, focused: true },
        expect.anything()
      );
    });

    it('starts where the caret stands as it is put in, moved after the editor arrived', async () => {
      const fixture = TestBed.createComponent(ChatLineEditorComponent);
      fixture.componentRef.setInput('draft', 'こんばんは');
      fixture.detectChanges();
      await fixture.whenStable();
      const area = (fixture.nativeElement as HTMLElement).querySelector<HTMLTextAreaElement>('textarea')!;
      area.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
      area.setSelectionRange(1, 1);

      arrive({ mountChatEditor: mounted } as unknown as ChatEditorModule);
      await Promise.resolve();
      await Promise.resolve();
      area.setSelectionRange(3, 3);
      fixture.detectChanges();
      TestBed.tick();

      expect(mounted).toHaveBeenCalledWith(
        expect.anything(),
        { text: 'こんばんは', selection: { from: 3, to: 3 }, focused: true },
        expect.anything()
      );
    });

    it('colours the editor again as a picture arrives, for the stamps in it to be drawn', async () => {
      await openAndArrive();
      const field = mounted.mock.results[0].value as { refreshSoon: ReturnType<typeof vi.fn> };
      field.refreshSoon.mockClear();

      TestBed.inject(ObjectChangeService).fileVersion.update((version) => version + 1);
      TestBed.tick();

      expect(field.refreshSoon).toHaveBeenCalled();
    });

    it('names the editor and its bars again as the language changes', async () => {
      await openAndArrive();
      const field = mounted.mock.results[0].value as { reconfigure: ReturnType<typeof vi.fn> };
      field.reconfigure.mockClear();

      TestBed.inject(TranslocoService).setActiveLang('en');
      TestBed.tick();

      expect(field.reconfigure).toHaveBeenCalled();
    });

    it('leaves the keys with another field the reader went to meanwhile', async () => {
      const other = document.createElement('input');
      document.body.append(other);
      try {
        await openAndArrive(() => other.focus());

        expect(mounted).toHaveBeenCalledWith(
          expect.anything(),
          { text: 'こんばんは', selection: { from: 5, to: 5 }, focused: false },
          expect.anything()
        );
      } finally {
        other.remove();
      }
    });
  });
});
