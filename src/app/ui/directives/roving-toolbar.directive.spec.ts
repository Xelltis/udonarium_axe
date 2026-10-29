import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { RovingToolbarDirective } from '@axe/ui/directives/roving-toolbar.directive';

@Component({
  template: `<div uiRovingToolbar role="toolbar">
    <button class="a">a</button>
    <button class="b">b</button>
    @if (more()) {
      <button class="c">c</button>
    }
    <div popover="manual"><button class="inside">inside</button></div>
  </div>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RovingToolbarDirective],
})
class ToolbarHostComponent {
  readonly more = signal(true);
}

describe('RovingToolbarDirective', () => {
  let fixture: ComponentFixture<ToolbarHostComponent>;
  const button = (name: string) => (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(`.${name}`)!;
  const stops = () =>
    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'))
      .filter((each) => each.getAttribute('tabindex') !== '-1')
      .map((each) => each.className);
  const press = (key: string, on: HTMLElement) =>
    on.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [ToolbarHostComponent], providers: [...TEST_PROVIDERS] });
    fixture = TestBed.createComponent(ToolbarHostComponent);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('leaves Tab one stop in the row, the first button, the popover’s buttons apart', () => {
    expect(stops()).toEqual(['a', 'inside']);
  });

  it('moves along the row with the arrows, Home and End, going round at the ends', () => {
    button('a').focus();
    press('ArrowRight', button('a'));
    expect(document.activeElement).toBe(button('b'));
    expect(stops()).toEqual(['b', 'inside']);

    press('End', button('b'));
    expect(document.activeElement).toBe(button('c'));
    press('ArrowRight', button('c'));
    expect(document.activeElement).toBe(button('a'));
    press('ArrowLeft', button('a'));
    expect(document.activeElement).toBe(button('c'));
    press('Home', button('c'));
    expect(document.activeElement).toBe(button('a'));
  });

  it('keeps the stop on the button last used, and finds another once that one goes', async () => {
    button('c').focus();
    expect(stops()).toEqual(['c', 'inside']);

    fixture.componentInstance.more.set(false);
    fixture.detectChanges();
    await vi.waitFor(() => expect(stops()).toEqual(['a', 'inside']));
  });
});
