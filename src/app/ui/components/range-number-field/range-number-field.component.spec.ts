import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiRangeNumberFieldComponent } from '@axe/ui/components/range-number-field/range-number-field.component';

@Component({
  imports: [UiRangeNumberFieldComponent],
  template: `<ui-range-number-field
    rangeName="width-range"
    numberName="width-num"
    [(value)]="value"
    [min]="1"
    [max]="100"
    [disabled]="disabled()"
  />`,
})
class HostComponent {
  readonly value = signal(10);
  readonly disabled = signal(false);
}

describe('UiRangeNumberFieldComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  const field = (name: string) =>
    (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(`input[name="${name}"]`)!;

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function enter(name: string, value: string): void {
    field(name).value = value;
    field(name).dispatchEvent(new Event('input'));
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    await settle();
  });

  it('shows the value in a slider and a typed field, each under the name and the bounds it was given', () => {
    expect(field('width-range').type).toBe('range');
    expect(field('width-num').type).toBe('number');
    expect(field('width-range').value).toBe('10');
    expect(field('width-num').value).toBe('10');
    expect(field('width-range').min).toBe('1');
    expect(field('width-num').max).toBe('100');
  });

  it('writes the value from the slider, and shows it in the typed field', async () => {
    enter('width-range', '30');
    await settle();

    expect(host.value()).toBe(30);
    expect(field('width-num').value).toBe('30');
  });

  it('writes the value typed, as a number, and moves the slider to it', async () => {
    enter('width-num', '25');
    await settle();

    expect(host.value()).toBe(25);
    expect(field('width-range').value).toBe('25');
  });

  it('follows a value written from outside', async () => {
    host.value.set(42);
    await settle();

    expect(field('width-range').value).toBe('42');
    expect(field('width-num').value).toBe('42');
  });

  it('refuses input in both fields while disabled', async () => {
    host.disabled.set(true);
    await settle();

    expect(field('width-range').hasAttribute('disabled')).toBe(true);
    expect(field('width-num').hasAttribute('disabled')).toBe(true);

    host.disabled.set(false);
    await settle();

    expect(field('width-range').hasAttribute('disabled')).toBe(false);
  });

  it('draws both fields disabled when it starts out disabled', async () => {
    const late = TestBed.createComponent(HostComponent);
    late.componentInstance.disabled.set(true);
    late.detectChanges();
    await late.whenStable();
    late.detectChanges();

    const fields = [...(late.nativeElement as HTMLElement).querySelectorAll<HTMLInputElement>('input')];
    expect(fields.map((each) => each.hasAttribute('disabled'))).toEqual([true, true]);
  });
});
