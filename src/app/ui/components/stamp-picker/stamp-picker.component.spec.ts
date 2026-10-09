import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ART_STAMP_FAMILIES, stampsOfFamily } from '@axe/domain/chat/stamp-catalog';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import {
  RECENT_STAMPS_STORAGE_KEY,
  StampPickerComponent,
} from '@axe/ui/components/stamp-picker/stamp-picker.component';

describe('StampPickerComponent', () => {
  let fixture: ComponentFixture<StampPickerComponent>;

  function open(): HTMLElement {
    TestBed.configureTestingModule({ imports: [StampPickerComponent], providers: [...TEST_PROVIDERS] });
    fixture = TestBed.createComponent(StampPickerComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function choices(root: HTMLElement): string[] {
    return [...root.querySelectorAll<HTMLElement>('[role="option"]')].map((option) =>
      option.dataset['testid']!.replace('stamp-picker-choice-', '')
    );
  }

  beforeEach(() => localStorage.removeItem(RECENT_STAMPS_STORAGE_KEY));
  afterEach(() => localStorage.removeItem(RECENT_STAMPS_STORAGE_KEY));

  it('opens on the sound effects for somebody who has picked nothing yet, with a tab for each family', () => {
    const root = open();

    expect(root.querySelector('[data-testid="stamp-picker-tab-recent"]')).toBeNull();
    expect(choices(root)).toEqual(stampsOfFamily('sfx').map((each) => each.id));

    (root.querySelector('[data-testid="stamp-picker-tab-seal"]') as HTMLElement).click();
    fixture.detectChanges();
    expect(choices(root)).toEqual(stampsOfFamily('seal').map((each) => each.id));
  });

  it('puts the families it draws on the first row and the character\u2019s on a second, by name, offering theirs larger', () => {
    const root = open();
    const rows = [...root.querySelectorAll<HTMLElement>('[data-testid^="stamp-picker-tab-row-"]')];
    const tabsIn = (row: HTMLElement) =>
      [...row.querySelectorAll<HTMLElement>('[role="tab"]')].map((tab) =>
        tab.dataset['testid']!.replace('stamp-picker-tab-', '')
      );

    expect(rows.map(tabsIn)).toEqual([['sfx', 'seal'], [...ART_STAMP_FAMILIES]]);
    const tab = root.querySelector('[data-testid="stamp-picker-tab-roll"]') as HTMLElement;
    expect(tab.textContent!.trim()).toBe(TestBed.inject(TRANSLATE_FN)('ui.stamp.families.roll'));

    tab.click();
    fixture.detectChanges();
    const first = stampsOfFamily('roll')[0].id;
    expect(choices(root)).toEqual(stampsOfFamily('roll').map((each) => each.id));
    const drawn = root.querySelector(`[data-testid="stamp-picker-choice-${first}"] [data-stamp]`) as HTMLElement;
    expect(drawn.style.height).toBe('68px');
  });

  it('lays the round seals out in narrow cells and gives the words of a sound effect room to keep clear', () => {
    const root = open();
    const list = root.querySelector('[data-testid="stamp-picker-list"]') as HTMLElement;
    expect(list.className).toContain('minmax(76px,1fr)');

    (root.querySelector('[data-testid="stamp-picker-tab-seal"]') as HTMLElement).click();
    fixture.detectChanges();
    expect(list.className).toContain('minmax(52px,1fr)');
  });

  it('opens a tab at the top of its stamps', () => {
    const root = open();
    const list = root.querySelector('[data-testid="stamp-picker-list"]') as HTMLElement;
    list.scrollTop = 120;

    (root.querySelector('[data-testid="stamp-picker-tab-seal"]') as HTMLElement).click();
    fixture.detectChanges();
    expect(list.scrollTop).toBe(0);
  });

  it('says which was picked, and opens on it among the recent ones the next time', () => {
    const root = open();
    const picked: string[] = [];
    fixture.componentInstance.picked.subscribe((id) => picked.push(id));

    (root.querySelector('[data-testid="stamp-picker-choice-sfx:gulp"]') as HTMLElement).click();
    expect(picked).toEqual(['sfx:gulp']);

    fixture.destroy();
    TestBed.resetTestingModule();
    const again = open();
    expect(again.querySelector('[data-testid="stamp-picker-tab-recent"]')).not.toBeNull();
    expect(choices(again)).toEqual(['sfx:gulp']);
  });

  it('leaves out of the recent ones a stamp this version does not know', () => {
    localStorage.setItem(RECENT_STAMPS_STORAGE_KEY, JSON.stringify(['sfx:from-a-newer-version', 'seal:ok', 3]));

    expect(choices(open())).toEqual(['seal:ok']);
  });

  it('offers a tab for each of the room\u2019s own sets, among the pictures after the character\u2019s families', () => {
    const root = open();
    fixture.componentRef.setInput('packs', [
      { identifier: 'pack-1', name: 'ねこ', stamps: [{ stampId: 'image:cat-a' }, { stampId: 'image:cat-b' }] },
    ]);
    fixture.detectChanges();

    const tab = root.querySelector('[data-testid="stamp-picker-tab-pack:pack-1"]') as HTMLElement;
    expect(tab.textContent!.trim()).toBe('ねこ');
    expect(tab.closest('[data-testid="stamp-picker-tab-row-1"]')).not.toBeNull();
    tab.click();
    fixture.detectChanges();
    expect(choices(root)).toEqual(['image:cat-a', 'image:cat-b']);
    expect(root.querySelector('[data-testid="stamp-picker-choice-image:cat-a"]')!.className).toContain('h-19');
  });

  it('offers to manage the sets only to whoever may', () => {
    const root = open();
    expect(root.querySelector('[data-testid="stamp-picker-manage"]')).toBeNull();

    fixture.componentRef.setInput('canManage', true);
    fixture.detectChanges();
    const asked = vi.fn();
    fixture.componentInstance.manage.subscribe(asked);
    (root.querySelector('[data-testid="stamp-picker-manage"]') as HTMLElement).click();
    expect(asked).toHaveBeenCalled();
  });
});
