import { ComponentFixture, TestBed } from '@angular/core/testing';
import { stampsOfFamily } from '@axe/domain/chat/stamp-catalog';
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

  it('offers a tab for each of the room\u2019s own sets, after the families', () => {
    const root = open();
    fixture.componentRef.setInput('packs', [
      { identifier: 'pack-1', name: 'ねこ', stamps: [{ stampId: 'image:cat-a' }, { stampId: 'image:cat-b' }] },
    ]);
    fixture.detectChanges();

    const tab = root.querySelector('[data-testid="stamp-picker-tab-pack:pack-1"]') as HTMLElement;
    expect(tab.textContent!.trim()).toBe('ねこ');
    tab.click();
    fixture.detectChanges();
    expect(choices(root)).toEqual(['image:cat-a', 'image:cat-b']);
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
