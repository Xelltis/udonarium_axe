import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiKnobComponent } from '@axe/ui/components/knob/knob.component';

@Component({
  imports: [UiKnobComponent],
  template: `<ui-knob
    [value]="value()"
    [min]="-1"
    [max]="1"
    [rest]="0"
    [step]="0.1"
    [disabled]="disabled()"
    label="FILTER"
    (valueChange)="turned.push($event); value.set($event)"
    (settle)="settled.push($event)"
  />`,
})
class HostComponent {
  readonly value = signal(0);
  readonly disabled = signal(false);
  readonly turned: number[] = [];
  readonly settled: number[] = [];
}

describe('UiKnobComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  const knob = () => (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('[role="slider"]')!;

  function pointer(type: string, clientY: number, shiftKey = false): void {
    const event = new MouseEvent(type, { bubbles: true, clientY, shiftKey, button: 0 });
    Object.defineProperty(event, 'pointerId', { value: 1 });
    knob().dispatchEvent(event);
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('tells assistive technology what it stands at', () => {
    expect(knob().getAttribute('aria-valuenow')).toBe('0');
    expect(knob().getAttribute('aria-valuemin')).toBe('-1');
    expect(knob().getAttribute('aria-label')).toBe('FILTER');
  });

  it('turns as it is dragged up and down, and settles where it is let go', async () => {
    pointer('pointerdown', 200);
    pointer('pointermove', 120);
    pointer('pointermove', 160);
    pointer('pointerup', 160);
    await fixture.whenStable();

    expect(host.turned).toEqual([1, 0.5]);
    expect(host.settled).toEqual([0.5]);
  });

  it('turns finely while Shift is held, and no further than its ends', () => {
    pointer('pointerdown', 200);
    pointer('pointermove', 120, true);
    expect(host.turned.at(-1)).toBeCloseTo(0.2, 9);

    pointer('pointermove', -1000);
    expect(host.turned.at(-1)).toBe(1);
  });

  it('steps with the arrow keys and goes to its ends with Home and End', () => {
    knob().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    knob().dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    knob().dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));

    expect(host.turned).toEqual([0.1, 1, -1]);
    expect(host.settled).toEqual([0.1, 1, -1]);
  });

  it('keeps the keys it turns by to itself, and lets the others through', () => {
    const heard: string[] = [];
    const listen = (event: KeyboardEvent) => heard.push(event.key);
    document.body.addEventListener('keydown', listen);

    knob().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    knob().dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    document.body.removeEventListener('keydown', listen);

    expect(heard).toEqual(['a']);
  });

  it('comes back to its resting place on a double click', async () => {
    host.value.set(0.7);
    await fixture.whenStable();

    knob().dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

    expect(host.settled).toEqual([0]);
  });

  it('does not turn while disabled', async () => {
    host.disabled.set(true);
    await fixture.whenStable();

    pointer('pointerdown', 200);
    pointer('pointermove', 100);
    knob().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    knob().dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

    expect(host.turned).toEqual([]);
    expect(knob().getAttribute('tabindex')).toBe('-1');
  });
});
