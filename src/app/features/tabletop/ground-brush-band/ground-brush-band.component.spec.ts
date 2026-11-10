import { TestBed } from '@angular/core/testing';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { GroundBrushService } from '@axe/application/tabletop/ground-brush.service';
import { ViewportService } from '@axe/application/ui/viewport.service';
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

  it('shows while the brush is on, and not while it is off', () => {
    expect(render().querySelector('[data-testid="ground-brush-band"]')).toBeNull();

    brush.active.set(true);
    expect(render().querySelector('[data-testid="ground-brush-band"]')).not.toBeNull();
  });

  it('chooses what the brush does, and offers the kinds of ground only for painting', () => {
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

  it('erases the paint with a brush of its own, offering no kind of ground for it', () => {
    brush.active.set(true);
    const fixture = TestBed.createComponent(GroundBrushBandComponent);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    root.querySelector<HTMLButtonElement>('[data-testid="ground-brush-erase"]')!.click();
    fixture.detectChanges();

    expect(brush.settings().kind).toBe('erase');
    expect(root.querySelector('[data-testid="ground-brush-layer-rock"]')).toBeNull();
  });

  it('turns the brush off when closed', () => {
    brush.active.set(true);

    render().querySelector<HTMLButtonElement>('[data-testid="ground-brush-close"]')!.click();

    expect(brush.active()).toBe(false);
  });

  it('says how the view is moved while the brush takes the presses on the board, with the mouse or a finger', () => {
    brush.active.set(true);
    const viewport = TestBed.inject(ViewportService);
    const touch = vi.spyOn(viewport, 'isTouch').mockReturnValue(false);

    const hint = render().querySelector('[data-testid="ground-brush-hint"]')!.textContent!;
    expect(hint).toContain('←↑↓→ で視点を動かす');
    expect(hint).toContain('Shift+↑↓ で傾ける');

    touch.mockReturnValue(true);
    expect(render().querySelector('[data-testid="ground-brush-hint"]')!.textContent).toContain('指でなぞって');
  });

  it('gives the arrow keys back to the view once a slider has been set with the pointer', () => {
    brush.active.set(true);
    const slider = render().querySelector<HTMLInputElement>('[data-testid="ground-brush-radius"]')!;
    document.body.append(slider.closest('[data-testid="ground-brush-band"]')!);
    slider.focus();
    expect(document.activeElement).toBe(slider);

    slider.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));

    expect(document.activeElement).not.toBe(slider);
    slider.closest('[data-testid="ground-brush-band"]')!.remove();
  });
});
