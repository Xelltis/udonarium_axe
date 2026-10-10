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

  async function type(text: string): Promise<void> {
    const search = query<HTMLInputElement>('icon-picker-search')!;
    search.value = text;
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
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

  it('offers what it was handed before anything is typed', () => {
    expect(choices()).toEqual(['chat', 'casino', 'map']);
  });

  it('marks the one it already stands for', () => {
    const marked = Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('[role="option"]')).filter(
      (choice) => choice.getAttribute('aria-selected') === 'true'
    );

    expect(marked.map((choice) => choice.title)).toEqual(['map']);
  });

  it('searches the whole catalogue once something is typed', async () => {
    await type('restaurant');

    expect(choices()).toContain('table_restaurant');
    expect(choices()).not.toContain('chat');
  });

  it('says so where no mark goes by that name', async () => {
    await type('notamarkanywhere');

    expect(choices()).toEqual([]);
    expect(query('icon-picker-list')!.parentElement!.textContent).toContain('見つかりません');
  });

  it('hands over the mark that was chosen', async () => {
    const picked: string[] = [];
    fixture.componentInstance.picked.subscribe((name) => picked.push(name));

    query<HTMLButtonElement>('icon-picker-choice-casino')!.click();

    expect(picked).toEqual(['casino']);
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
