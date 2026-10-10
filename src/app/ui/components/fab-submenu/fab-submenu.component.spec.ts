import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiFabSubmenuComponent } from '@axe/ui/components/fab-submenu/fab-submenu.component';

@Component({
  imports: [UiFabSubmenuComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ui-fab-submenu label="Widgets" testId="menu" (closed)="closes = closes + 1">
    <button type="button" data-testid="inside">inside</button>
  </ui-fab-submenu>`,
})
class HostComponent {
  closes = 0;
}

describe('UiFabSubmenuComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    host = fixture.nativeElement as HTMLElement;
    document.body.appendChild(host);
  });

  afterEach(() => {
    fixture.destroy();
    host.remove();
  });

  it('holds what it is given, named for assistive technology', () => {
    const menu = host.querySelector('[data-testid="menu"]')!;
    expect(menu.getAttribute('role')).toBe('dialog');
    expect(menu.getAttribute('aria-label')).toBe('Widgets');
    expect(menu.querySelector('[data-testid="inside"]')).not.toBeNull();
  });

  it('asks to be closed on Escape and on a press outside it', () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));

    expect(fixture.componentInstance.closes).toBe(2);
  });

  it('stays open for a press inside it, and leaves a press on an opener to the opener', () => {
    const opener = document.createElement('button');
    opener.setAttribute('data-fab-submenu-toggle', '');
    document.body.appendChild(opener);

    host.querySelector('[data-testid="inside"]')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    opener.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));

    expect(fixture.componentInstance.closes).toBe(0);
    opener.remove();
  });
});
