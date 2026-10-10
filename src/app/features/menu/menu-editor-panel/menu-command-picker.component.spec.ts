import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MenuCommand, menuCommandOf } from '@axe/domain/ui/menu-command';
import { MenuCommandPickerComponent } from '@axe/features/menu/menu-editor-panel/menu-command-picker.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('MenuCommandPickerComponent', () => {
  let fixture: ComponentFixture<MenuCommandPickerComponent>;

  const OFFERED = ['chat', 'jukebox', 'mapEditor'].map((key) => menuCommandOf(key)!);

  function query<T extends HTMLElement>(testId: string): T | null {
    return fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);
  }

  function choices(): string[] {
    return Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('[role="option"]')).map((choice) =>
      choice.dataset['testid']!.replace('menu-command-choice-', '')
    );
  }

  async function type(text: string): Promise<void> {
    const search = query<HTMLInputElement>('menu-command-search')!;
    search.value = text;
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function offer(commands: MenuCommand[]): Promise<void> {
    fixture.componentRef.setInput('commands', commands);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MenuCommandPickerComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
    fixture = TestBed.createComponent(MenuCommandPickerComponent);
    await offer([...OFFERED]);
  });

  it('lists everything it was handed, in the order it was handed them', () => {
    expect(choices()).toEqual(['chat', 'jukebox', 'mapEditor']);
  });

  it('draws each one with the mark it will wear on the menu', () => {
    expect(query('menu-command-choice-chat')!.textContent).toContain(menuCommandOf('chat')!.icon);
  });

  it('narrows to what answers the name that was typed', async () => {
    await type('チャット');

    expect(choices()).toEqual(['chat']);
  });

  it('answers to the key as well as to the name', async () => {
    await type('mapEditor');

    expect(choices()).toEqual(['mapEditor']);
  });

  it('says so where nothing answers what was typed', async () => {
    await type('nothinggoesbythat');

    expect(choices()).toEqual([]);
    expect(query('menu-command-list')!.textContent).toContain('見つかりません');
  });

  it('hands over the one that was chosen, and stays open for the next', () => {
    const picked: string[] = [];
    fixture.componentInstance.picked.subscribe((key) => picked.push(key));

    query<HTMLButtonElement>('menu-command-choice-jukebox')!.click();

    expect(picked).toEqual(['jukebox']);
    expect(choices()).toEqual(['chat', 'jukebox', 'mapEditor']);
  });

  it('has nothing to offer once everything is on the menu', async () => {
    await offer([]);

    expect(query<HTMLButtonElement>('menu-editor-add')!.disabled).toBe(true);
    expect(query('menu-command-list')!.textContent).toContain('足せる項目はもうありません');
  });
});
