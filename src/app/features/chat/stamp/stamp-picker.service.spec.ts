import { Component, viewChild, ViewContainerRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { OverlayLayers } from '@axe/application/ui/overlay-layers';
import { PanelService } from '@axe/application/ui/panel.service';
import { STORAGE_KEYS } from '@axe/core/storage/storage-keys';
import { StampPickerService } from '@axe/features/chat/stamp/stamp-picker.service';
import { StampPackPanelComponent } from '@axe/features/chat/stamp-pack-panel/stamp-pack-panel.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

@Component({ selector: 'test-overlay-layer', template: '<ng-container #layer></ng-container>' })
class OverlayLayerHostComponent {
  readonly layer = viewChild.required('layer', { read: ViewContainerRef });
}

describe('StampPickerService', () => {
  let service: StampPickerService;
  let anchor: HTMLButtonElement;
  let picked: string[];
  let host: ComponentFixture<OverlayLayerHostComponent>;

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
    TestBed.inject(OverlayLayers).main = host.componentInstance.layer();
    service = TestBed.inject(StampPickerService);
    anchor = document.createElement('button');
    document.body.appendChild(anchor);
    picked = [];
    localStorage.removeItem(STORAGE_KEYS.recentStamps);
  });

  afterEach(() => {
    service.close();
    anchor.remove();
    (host.nativeElement as HTMLElement).remove();
    host.destroy();
    localStorage.removeItem(STORAGE_KEYS.recentStamps);
  });

  it('opens under the button, and hands on the stamp picked as it closes', () => {
    service.open(anchor, 'line', (id) => picked.push(id));
    expect(picker()).not.toBeNull();

    (picker()!.querySelector('[data-testid="stamp-picker-choice-sfx:laugh"]') as HTMLElement).click();

    expect(picked).toEqual(['sfx:laugh']);
    expect(picker()).toBeNull();
  });

  it('opens toward the larger room for a reaction, and upward from the bar over the box where it fits', () => {
    vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue(new DOMRect(10, 300, 40, 20));
    const below = 300 + 20;

    service.open(anchor, 'reaction', (id) => picked.push(id));
    expect(parseFloat(picker()!.style.top)).toBeGreaterThanOrEqual(below);
    service.close();

    service.open(anchor, 'line', (id) => picked.push(id), 'end', 'up');
    expect(parseFloat(picker()!.style.top)).toBeLessThan(300);
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
    vi.spyOn(TestBed.inject(RolePermissionService), 'canEditTabletop').mockReturnValue(true);
    const opened = vi.spyOn(TestBed.inject(PanelService), 'open').mockReturnValue(null as never);

    service.open(anchor, 'line', (id) => picked.push(id));
    (picker()!.querySelector('[data-testid="stamp-picker-manage"]') as HTMLElement).click();

    expect(picker()).toBeNull();
    expect(opened).toHaveBeenCalledWith(StampPackPanelComponent, expect.anything());
  });
});
