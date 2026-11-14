import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MapEditorState } from '@axe/features/map-editor/editor/map-editor-state';
import { MapEditorTextBoxComponent } from '@axe/features/map-editor/editor/map-editor-text-box.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('MapEditorTextBoxComponent', () => {
  let fixture: ComponentFixture<MapEditorTextBoxComponent>;
  let state: MapEditorState;

  const box = () => (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('[contenteditable]')!;

  async function edit(x: number, y: number, initial: string): Promise<void> {
    fixture.componentRef.setInput('editing', { x, y, initial });
    fixture.detectChanges();
    await fixture.whenStable();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [MapEditorTextBoxComponent],
      providers: [...TEST_PROVIDERS, MapEditorState],
    });
    state = TestBed.inject(MapEditorState);
    fixture = TestBed.createComponent(MapEditorTextBoxComponent);
    document.body.appendChild(fixture.nativeElement);
  });

  afterEach(() => {
    (fixture.nativeElement as HTMLElement).remove();
  });

  it('lies where the text will be drawn, in the font it will be drawn in, as far as the map is zoomed', async () => {
    state.zoom.set(2);
    state.fontSize.set(18);
    state.textBold.set(true);
    state.textColor.set('#123456');

    await edit(30, 40, '');

    expect(box().style.left).toBe('60px');
    expect(box().style.top).toBe('80px');
    expect(box().style.fontSize).toBe('36px');
    expect(box().style.fontWeight).toBe('bold');
    expect(box().style.fontStyle).toBe('normal');
  });

  it('starts with the text of the edit and takes the caret, and again for the next edit', async () => {
    await edit(0, 0, 'まえの文');

    expect(box().textContent).toBe('まえの文');
    expect(document.activeElement).toBe(box());

    await edit(10, 10, 'つぎの文');
    expect(box().textContent).toBe('つぎの文');
  });

  it('tells of what is typed', async () => {
    const drafted: string[] = [];
    fixture.componentInstance.drafted.subscribe((text) => drafted.push(text));
    await edit(0, 0, '');

    Object.defineProperty(box(), 'innerText', { value: 'hello', configurable: true });
    box().dispatchEvent(new Event('input'));

    expect(drafted).toEqual(['hello']);
  });

  it('asks to keep the text on Ctrl+Enter or Cmd+Enter and to drop it on Escape, keeping the keys to itself', async () => {
    const asked: string[] = [];
    fixture.componentInstance.committed.subscribe(() => asked.push('keep'));
    fixture.componentInstance.cancelled.subscribe(() => asked.push('drop'));
    const outside = vi.fn();
    document.body.addEventListener('keydown', outside);
    await edit(0, 0, '');
    const press = (init: KeyboardEventInit): KeyboardEvent => {
      const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
      box().dispatchEvent(event);
      return event;
    };

    try {
      expect(press({ key: 'Enter' }).defaultPrevented).toBe(false);
      expect(asked).toEqual([]);
      expect(outside).toHaveBeenCalledTimes(1);

      expect(press({ key: 'Enter', ctrlKey: true }).defaultPrevented).toBe(true);
      press({ key: 'Enter', metaKey: true });
      press({ key: 'Escape' });

      expect(asked).toEqual(['keep', 'keep', 'drop']);
      expect(outside).toHaveBeenCalledTimes(1);
    } finally {
      document.body.removeEventListener('keydown', outside);
    }
  });

  it('keeps a press on the box from reaching the board under it', async () => {
    const outside = vi.fn();
    (fixture.nativeElement as HTMLElement).addEventListener('pointerdown', outside);
    await edit(0, 0, '');

    box().dispatchEvent(new Event('pointerdown', { bubbles: true }));

    expect(outside).not.toHaveBeenCalled();
  });
});
