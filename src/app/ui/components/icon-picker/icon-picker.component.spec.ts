import { ComponentFixture, TestBed } from '@angular/core/testing';
import { IconPickerComponent } from '@axe/ui/components/icon-picker/icon-picker.component';

describe('IconPickerComponent', () => {
  let fixture: ComponentFixture<IconPickerComponent>;

  function query<T extends HTMLElement>(testId: string): T | null {
    return fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);
  }

  function choices(): string[] {
    return Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('[role="option"]')).map(
      (choice) => choice.title
    );
  }

  function popover(): HTMLElement {
    return fixture.nativeElement.querySelector('[popover]');
  }

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /** Opens the list from its button, standing in for the browser's own popover, which happy-dom has none of. */
  async function open(): Promise<void> {
    popover().showPopover = () => undefined;
    popover().hidePopover = () => undefined;
    query<HTMLButtonElement>('icon-picker-open')!.click();
    await settle();
  }

  async function type(text: string): Promise<void> {
    const search = query<HTMLInputElement>('icon-picker-search')!;
    search.value = text;
    search.dispatchEvent(new Event('input'));
    await settle();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [IconPickerComponent] }).compileComponents();
    fixture = TestBed.createComponent(IconPickerComponent);
    fixture.componentRef.setInput('value', 'map');
    fixture.componentRef.setInput('suggested', ['chat', 'casino', 'map']);
    fixture.detectChanges();
  });

  it('wears the mark it stands for', () => {
    expect(query('icon-picker-open')!.textContent).toContain('map');
  });

  it('offers what it was handed before anything is typed', async () => {
    await open();

    expect(choices()).toEqual(['chat', 'casino', 'map']);
  });

  it('marks the one it already stands for', async () => {
    await open();

    const marked = Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('[role="option"]')).filter(
      (choice) => choice.getAttribute('aria-selected') === 'true'
    );

    expect(marked.map((choice) => choice.title)).toEqual(['map']);
  });

  it('searches the whole catalogue once something is typed', async () => {
    await open();
    await type('restaurant');

    expect(choices()).toContain('table_restaurant');
    expect(choices()).not.toContain('chat');
  });

  it('says so where no mark goes by that name', async () => {
    await open();
    await type('notamarkanywhere');

    expect(choices()).toEqual([]);
    expect(query('icon-picker-list')!.parentElement!.textContent).toContain('見つかりません');
  });

  it('hands over the mark that was chosen', async () => {
    await open();
    const picked: string[] = [];
    fixture.componentInstance.picked.subscribe((name) => picked.push(name));

    query<HTMLButtonElement>('icon-picker-choice-casino')!.click();

    expect(picked).toEqual(['casino']);
  });

  it('draws no marks while the list stands shut, and draws them once it opens', async () => {
    expect(query('icon-picker-list')).toBeTruthy();
    expect(choices()).toEqual([]);

    await open();

    expect(choices()).toEqual(['chat', 'casino', 'map']);
    expect(query('icon-picker-open')!.getAttribute('aria-expanded')).toBe('true');
  });

  it('lets the marks go again as the list shuts, whether by a choice, its button or Escape', async () => {
    await open();
    query<HTMLButtonElement>('icon-picker-choice-casino')!.click();
    await settle();
    expect(choices()).toEqual([]);

    await open();
    query<HTMLButtonElement>('icon-picker-open')!.click();
    await settle();
    expect(choices()).toEqual([]);

    await open();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await settle();
    expect(choices()).toEqual([]);
    expect(query('icon-picker-open')!.getAttribute('aria-expanded')).toBe('false');
  });

  it('stands the list against its button by the height it has once the marks are drawn', async () => {
    const anchorTop = window.innerHeight - 40;
    fixture.nativeElement.getBoundingClientRect = () => new DOMRect(100, anchorTop, 24, 24);
    popover().getBoundingClientRect = () =>
      new DOMRect(0, 0, 296, 50 + popover().querySelectorAll('[role="option"]').length * 10);

    await open();

    expect(popover().style.top).toBe(`${anchorTop - 6 - 80}px`);
  });

  it('offers to take the mark away only where it is allowed to', () => {
    expect(query('icon-picker-clear')).toBeNull();

    fixture.componentRef.setInput('clearable', true);
    fixture.detectChanges();

    expect(query('icon-picker-clear')).toBeTruthy();
  });

  it('hands over the empty name when the mark is taken away', () => {
    fixture.componentRef.setInput('clearable', true);
    fixture.detectChanges();
    const picked: string[] = [];
    fixture.componentInstance.picked.subscribe((name) => picked.push(name));

    query<HTMLButtonElement>('icon-picker-clear')!.click();

    expect(picked).toEqual(['']);
  });

  it('leaves the list shut in a browser that cannot open one', () => {
    expect(() => query<HTMLButtonElement>('icon-picker-open')!.click()).not.toThrow();
  });
});
