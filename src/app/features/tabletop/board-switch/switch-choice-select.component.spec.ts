import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  SwitchChoice,
  SwitchChoiceSelectComponent,
} from '@axe/features/tabletop/board-switch/switch-choice-select.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

@Component({
  imports: [SwitchChoiceSelectComponent],
  template: `<select
    switchChoice
    class="flex-1"
    data-testid="picker"
    [choices]="choices()"
    [keys]="keys()"
    keyLabelPrefix="feature.boardSwitch.reader."
    [blankLabel]="blank()"
    [missingName]="missingName()"
    [value]="value()"
    (picked)="picked.push($event)"
  ></select>`,
})
class HostComponent {
  readonly choices = signal<SwitchChoice[]>([
    { value: 'door', name: '扉の音' },
    { value: 'bell', name: '鐘の音' },
  ]);
  readonly keys = signal<string[]>([]);
  readonly blank = signal<string | null>('（選んでください）');
  readonly missingName = signal<string | null>(null);
  readonly value = signal('');
  readonly picked: string[] = [];
}

describe('SwitchChoiceSelectComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  const select = () => fixture.nativeElement.querySelector('select') as HTMLSelectElement;
  const options = () => Array.from(select().querySelectorAll('option'));
  const listed = () => options().map((option) => [option.value, option.textContent?.trim() ?? '']);
  const chosen = () => options().find((option) => option.selected)?.value;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HostComponent], providers: [...TEST_PROVIDERS] });
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
  });

  it('is drawn onto the select it is written on, keeping the look and the name the list gave it', () => {
    fixture.detectChanges();

    expect(select().dataset['testid']).toBe('picker');
    expect(select().classList.contains('flex-1')).toBe(true);
    expect(select().classList.contains('bg-ui-elevated')).toBe(true);
  });

  it('offers a blank and then the choices by name, with the blank picked while nothing is', () => {
    fixture.detectChanges();

    expect(listed()).toEqual([
      ['', '（選んでください）'],
      ['door', '扉の音'],
      ['bell', '鐘の音'],
    ]);
    expect(chosen()).toBe('');
  });

  it('picks the choice the value names, and offers no blank without a label for one', () => {
    host.blank.set(null);
    host.value.set('bell');
    fixture.detectChanges();

    expect(listed().map(([value]) => value)).toEqual(['door', 'bell']);
    expect(chosen()).toBe('bell');
  });

  it('lists keys under their translations', () => {
    host.choices.set([]);
    host.blank.set(null);
    host.keys.set(['presser', 'master']);
    host.value.set('master');
    fixture.detectChanges();

    expect(listed().map(([value]) => value)).toEqual(['presser', 'master']);
    expect(listed().every(([, name]) => name.length > 0)).toBe(true);
    expect(chosen()).toBe('master');
  });

  it('keeps a missing name listed and picked, so opening the list does not swap it for another', () => {
    host.value.set('gone');
    host.missingName.set('消えた音');
    fixture.detectChanges();

    expect(listed().map(([value]) => value)).toEqual(['', 'gone', 'door', 'bell']);
    expect(listed()[1][1]).toContain('消えた音');
    expect(chosen()).toBe('gone');
  });

  it('lists nothing as missing while the value is on offer, is empty, or the picker was told no name for it', () => {
    host.missingName.set('扉の音');
    host.value.set('door');
    fixture.detectChanges();
    expect(listed().map(([value]) => value)).toEqual(['', 'door', 'bell']);

    host.value.set('');
    fixture.detectChanges();
    expect(listed().map(([value]) => value)).toEqual(['', 'door', 'bell']);

    host.missingName.set(null);
    host.value.set('gone');
    fixture.detectChanges();
    expect(listed().map(([value]) => value)).toEqual(['', 'door', 'bell']);
  });

  it('hands on what the user picks', () => {
    fixture.detectChanges();
    select().value = 'bell';
    select().dispatchEvent(new Event('change'));

    expect(host.picked).toEqual(['bell']);
  });
});
