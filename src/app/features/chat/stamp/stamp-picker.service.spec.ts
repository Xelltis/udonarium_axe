import { Component, viewChild, ViewContainerRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { StampPickerService } from '@axe/features/chat/stamp/stamp-picker.service';
import { StampPackPanelComponent } from '@axe/features/chat/stamp-pack-panel/stamp-pack-panel.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { RECENT_STAMPS_STORAGE_KEY } from '@axe/ui/components/stamp-picker/stamp-picker.component';

@Component({ selector: 'test-overlay-layer', template: '<ng-container #layer></ng-container>' })
class OverlayLayerHostComponent {
  readonly layer = viewChild.required('layer', { read: ViewContainerRef });
}

describe('StampPickerService', () => {
  let service: StampPickerService;
  let anchor: HTMLButtonElement;
  let picked: string[];
  let host: ComponentFixture<OverlayLayerHostComponent>;
  const ownLayer = ContextMenuService.defaultParentViewContainerRef;

  function picker(): HTMLElement | null {
    return document.querySelector('[data-testid="stamp-picker"]');
  }

  function press(target: EventTarget): void {
    target.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [OverlayLayerHostComponent], providers: [...TEST_PROVIDERS] });
    host = TestBed.createComponent(OverlayLayerHostComponent);
    host.detectChanges();
    document.body.appendChild(host.nativeElement);
    ContextMenuService.defaultParentViewContainerRef = host.componentInstance.layer();
    service = TestBed.inject(StampPickerService);
    anchor = document.createElement('button');
    document.body.appendChild(anchor);
    picked = [];
    localStorage.removeItem(RECENT_STAMPS_STORAGE_KEY);
  });

  afterEach(() => {
    service.close();
    anchor.remove();
    (host.nativeElement as HTMLElement).remove();
    host.destroy();
    ContextMenuService.defaultParentViewContainerRef = ownLayer;
    localStorage.removeItem(RECENT_STAMPS_STORAGE_KEY);
  });

  it('opens under the button, and hands on the stamp picked as it closes', () => {
    service.open(anchor, 'line', (id) => picked.push(id));
    expect(picker()).not.toBeNull();

    (picker()!.querySelector('[data-testid="stamp-picker-choice-sfx:laugh"]') as HTMLElement).click();

    expect(picked).toEqual(['sfx:laugh']);
    expect(picker()).toBeNull();
  });

  it('closes on a press outside it, and on Escape, but not on a press inside it', () => {
    service.open(anchor, 'line', (id) => picked.push(id));
    press(picker()!);
    expect(picker()).not.toBeNull();

    press(document.body);
    expect(picker()).toBeNull();

    service.open(anchor, 'line', (id) => picked.push(id));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(picker()).toBeNull();
    expect(picked).toEqual([]);
  });

  it('closes where the same button asks again, and keeps to one picker for the whole page', () => {
    const other = document.createElement('button');
    document.body.appendChild(other);
    try {
      service.toggle(anchor, 'line', () => undefined);
      service.toggle(other, 'line', () => undefined);
      expect(document.querySelectorAll('[data-testid="stamp-picker"]')).toHaveLength(1);
      expect(service.isOpenFor(other)).toBe(true);

      service.toggle(other, 'line', () => undefined);
      expect(picker()).toBeNull();
    } finally {
      other.remove();
    }
  });

  it('closes and opens the panel for the room\u2019s sets when asked to manage them', () => {
    vi.spyOn(TestBed.inject(RolePermissionService), 'canEditTabletop', 'get').mockReturnValue(true);
    const opened = vi.spyOn(TestBed.inject(PanelService), 'open').mockReturnValue(null as never);

    service.open(anchor, 'line', (id) => picked.push(id));
    (picker()!.querySelector('[data-testid="stamp-picker-manage"]') as HTMLElement).click();

    expect(picker()).toBeNull();
    expect(opened).toHaveBeenCalledWith(StampPackPanelComponent, expect.anything());
  });
});
