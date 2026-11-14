import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  WhiteBoardWordBoxComponent,
  WordBoxLook,
} from '@axe/features/tabletop/white-board/white-board-word-box.component';

describe('WhiteBoardWordBoxComponent', () => {
  const LOOK: WordBoxLook = {
    fontSize: 24,
    color: '#123456',
    bold: true,
    italic: false,
    underline: true,
    strike: true,
    shadow: true,
    outline: { color: '#ffffff', width: 2 },
  };

  let fixture: ComponentFixture<WhiteBoardWordBoxComponent>;

  async function open(words = '', look: WordBoxLook = LOOK): Promise<HTMLElement> {
    TestBed.configureTestingModule({ imports: [WhiteBoardWordBoxComponent] });
    fixture = TestBed.createComponent(WhiteBoardWordBoxComponent);
    fixture.componentRef.setInput('at', { x: 100, y: 40 });
    fixture.componentRef.setInput('zoom', 2);
    fixture.componentRef.setInput('look', look);
    fixture.componentRef.setInput('words', words);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();
    return (fixture.nativeElement as HTMLElement).querySelector('[contenteditable]') as HTMLElement;
  }

  function key(box: HTMLElement, init: KeyboardEventInit): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
    box.dispatchEvent(event);
    return event;
  }

  afterEach(() => {
    (fixture.nativeElement as HTMLElement).remove();
  });

  it('stands where the words will be written, at the size the sheet is shown', async () => {
    const box = await open();

    expect(box.style.left).toBe('200px');
    expect(box.style.top).toBe('80px');
    expect(box.style.fontSize).toBe('48px');
    expect(box.style.fontWeight).toBe('bold');
    expect(box.style.fontStyle).toBe('normal');
    expect(box.style.textDecoration).toBe('underline line-through');
    expect(box.style.textShadow).toBe('6px 8px 16px rgba(0,0,0,0.35)');
  });

  it('carries no line or shadow the words will not have', async () => {
    const box = await open('', { ...LOOK, underline: false, strike: false, shadow: false, outline: null });

    expect(box.style.textDecoration).toBe('none');
    expect(box.style.textShadow).toBe('none');
  });

  it('opens holding the words being typed over, ready to be typed into', async () => {
    const box = await open('すでにある言葉');

    expect(box.textContent).toBe('すでにある言葉');
    expect(document.activeElement).toBe(box);
  });

  it('reports what it holds after every change', async () => {
    const box = await open();
    const typed = vi.fn();
    fixture.componentInstance.typed.subscribe(typed);

    box.innerText = 'こんにちは';
    box.dispatchEvent(new Event('input', { bubbles: true }));

    expect(typed).toHaveBeenCalledWith('こんにちは');
  });

  it('asks to be written down on Ctrl+Enter and thrown away on Escape, keeping both keys from the editor', async () => {
    const box = await open();
    const commit = vi.fn();
    const discard = vi.fn();
    fixture.componentInstance.commit.subscribe(commit);
    fixture.componentInstance.discard.subscribe(discard);
    const heardOutside = vi.fn();
    (fixture.nativeElement as HTMLElement).addEventListener('keydown', heardOutside);

    key(box, { key: 'Enter' });
    expect(commit).not.toHaveBeenCalled();

    expect(key(box, { key: 'Enter', ctrlKey: true }).defaultPrevented).toBe(true);
    expect(commit).toHaveBeenCalledOnce();

    key(box, { key: 'Escape' });
    expect(discard).toHaveBeenCalledOnce();
    expect(heardOutside).toHaveBeenCalledOnce();
  });

  it('leaves Escape and Enter to the input method while it is composing', async () => {
    const box = await open();
    const commit = vi.fn();
    const discard = vi.fn();
    fixture.componentInstance.commit.subscribe(commit);
    fixture.componentInstance.discard.subscribe(discard);

    key(box, { key: 'Escape', isComposing: true });
    key(box, { key: 'Enter', ctrlKey: true, isComposing: true });

    expect(commit).not.toHaveBeenCalled();
    expect(discard).not.toHaveBeenCalled();
  });
});
