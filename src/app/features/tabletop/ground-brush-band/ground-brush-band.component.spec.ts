import { TestBed } from '@angular/core/testing';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { GroundBrushService } from '@axe/application/tabletop/ground-brush.service';
import { Table3dService } from '@axe/application/tabletop/table-3d.service';
import { GroundBrushBandComponent } from '@axe/features/tabletop/ground-brush-band/ground-brush-band.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('GroundBrushBandComponent', () => {
  let brush: GroundBrushService;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [GroundBrushBandComponent], providers: [...TEST_PROVIDERS] });
    brush = TestBed.inject(GroundBrushService);
    vi.spyOn(TestBed.inject(RolePermissionService), 'canEditShared').mockReturnValue(true);
  });

  afterEach(() => vi.restoreAllMocks());

  function render(): HTMLElement {
    const fixture = TestBed.createComponent(GroundBrushBandComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows over a table drawn on a canvas while the brush is on, and not over the page’s own table', () => {
    brush.active.set(true);
    expect(render().querySelector('[data-testid="ground-brush-band"]')).toBeNull();

    TestBed.inject(Table3dService).renderer.set('three');
    expect(render().querySelector('[data-testid="ground-brush-band"]')).not.toBeNull();
  });

  it('chooses what the brush does, and offers the kinds of ground only for painting', () => {
    TestBed.inject(Table3dService).renderer.set('three');
    brush.active.set(true);
    const fixture = TestBed.createComponent(GroundBrushBandComponent);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="ground-brush-layer-rock"]')).toBeNull();

    root.querySelector<HTMLButtonElement>('[data-testid="ground-brush-paint"]')!.click();
    fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('[data-testid="ground-brush-layer-rock"]')!.click();

    expect(brush.settings()).toMatchObject({ kind: 'paint', layer: 'rock' });
  });

  it('turns the brush off when closed', () => {
    TestBed.inject(Table3dService).renderer.set('three');
    brush.active.set(true);

    render().querySelector<HTMLButtonElement>('[data-testid="ground-brush-close"]')!.click();

    expect(brush.active()).toBe(false);
  });
});
