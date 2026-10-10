import { ChangeDetectionStrategy, Component, inject, input, viewChild, ViewContainerRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  bottomSheetLayer,
  BottomSheetRef,
  BottomSheetService,
  hostPanelLayer,
  Z_BOTTOM_SHEET,
} from '@axe/application/ui/bottom-sheet.service';
import { BottomSheetComponent } from '@axe/ui/components/bottom-sheet/bottom-sheet.component';

@Component({
  selector: 'test-sheet-content',
  template: `<p data-testid="said">{{ said() }}</p>
    <button type="button" data-testid="answer" (click)="ref.close('yes')">answer</button>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class SheetContentComponent {
  readonly ref = inject(BottomSheetRef);
  readonly said = input('');
}

@Component({
  selector: 'test-sheet-host',
  template: `<ng-container #layer />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class SheetHostComponent {
  readonly layer = viewChild.required('layer', { read: ViewContainerRef });
}

describe('a sheet rising from the bottom', () => {
  let fixture: ComponentFixture<SheetHostComponent>;
  let service: BottomSheetService;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [SheetHostComponent] });
    BottomSheetService.frameComponentClass = BottomSheetComponent;
    fixture = TestBed.createComponent(SheetHostComponent);
    fixture.detectChanges();
    service = TestBed.inject(BottomSheetService);
  });

  afterEach(() => {
    service.closeAll();
    BottomSheetService.frameComponentClass = null;
  });

  function open(): BottomSheetRef<string> {
    const ref = service.open<string>(SheetContentComponent, {
      title: '項目の編集',
      inputs: { said: 'HP' },
      layer: fixture.componentInstance.layer(),
    });
    fixture.detectChanges();
    return ref;
  }

  const sheet = () => document.querySelector('[data-testid="bottom-sheet"]') as HTMLElement | null;

  it('shows its title and its content with the inputs it was given', () => {
    open();

    expect(sheet()?.querySelector('h2')?.textContent).toBe('項目の編集');
    expect(sheet()?.querySelector('[data-testid="said"]')?.textContent).toBe('HP');
    expect(sheet()?.querySelector('[role="dialog"]')?.getAttribute('aria-modal')).toBe('true');
  });

  it('answers with what the content closes it with', async () => {
    const ref = open();

    (sheet()!.querySelector('[data-testid="answer"]') as HTMLButtonElement).click();

    await expect(ref.closed).resolves.toBe('yes');
    expect(sheet()).toBeNull();
  });

  it('answers nothing when closed from its button', async () => {
    const ref = open();

    (sheet()!.querySelector('[data-testid="bottom-sheet-close"]') as HTMLButtonElement).click();

    await expect(ref.closed).resolves.toBeNull();
    expect(service.isOpen).toBe(false);
  });

  it('closes on Escape', async () => {
    const ref = open();

    sheet()!
      .querySelector('section')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    await expect(ref.closed).resolves.toBeNull();
  });

  it('closes on a press on the backdrop, and not on one inside', async () => {
    const ref = open();

    sheet()!.querySelector('section')!.click();
    expect(ref.isOpen).toBe(true);

    sheet()!.click();
    await expect(ref.closed).resolves.toBeNull();
  });

  it('keeps Tab going round inside it', () => {
    open();
    const buttons = Array.from(sheet()!.querySelectorAll('button'));
    const last = buttons[buttons.length - 1];
    last.focus();

    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    last.dispatchEvent(tab);

    expect(tab.defaultPrevented).toBe(true);
  });

  it('stands above the panels', () => {
    open();

    expect(sheet()!.style.zIndex).toBe(String(Z_BOTTOM_SHEET));
  });

  it('closes unanswered with nowhere to be drawn', async () => {
    BottomSheetService.frameComponentClass = null;

    const ref = service.open(SheetContentComponent, { title: 'x', layer: fixture.componentInstance.layer() });

    await expect(ref.closed).resolves.toBeNull();
  });
});

describe('where a sheet stands', () => {
  it('stands at its usual place over an ordinary panel', () => {
    expect(bottomSheetLayer(null)).toBe(Z_BOTTOM_SHEET);
    expect(bottomSheetLayer(5)).toBe(Z_BOTTOM_SHEET);
  });

  it('stands just above a panel that stands higher', () => {
    expect(bottomSheetLayer(1_900_001)).toBe(1_900_002);
  });

  it('reads the layer of the panel its host stands in', () => {
    const panel = document.createElement('div');
    panel.setAttribute('data-z-layer', '1900001');
    const host = document.createElement('button');
    panel.appendChild(host);

    expect(hostPanelLayer(host)).toBe(1_900_001);
    expect(hostPanelLayer(document.createElement('button'))).toBeNull();
    expect(hostPanelLayer(null)).toBeNull();
  });
});
