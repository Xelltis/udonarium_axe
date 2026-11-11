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

  it('says how the view is moved while the brush takes the presses on the board, as keys and what they do', () => {
    brush.active.set(true);
    const viewport = TestBed.inject(ViewportService);
    const touch = vi.spyOn(viewport, 'isTouch').mockReturnValue(false);

    const guide = () => render().querySelector('[data-testid="ground-brush-hint"]')!;
    const items = [...guide().children].map((item) => item.textContent!.replace(/\s+/g, ' ').trim());
    expect(items).toEqual([
      '盤をドラッグ地面を変える',
      '←↑↓→/ホイールボタンでドラッグ動かす',
      'Shift+←→/右ドラッグ回す',
      'Shift+↑↓傾ける',
      'ホイール/Ctrl+↑↓寄る・引く',
    ]);
    expect(guide().querySelectorAll('kbd').length).toBeGreaterThan(5);

    touch.mockReturnValue(true);
    expect(guide().textContent).toContain('指でなぞる');
    expect(guide().textContent).not.toContain('Shift');
  });

  it('keeps the presses that take back and close at the end of the row of what the brush does', () => {
    brush.active.set(true);
    const band = render().querySelector('[data-testid="ground-brush-band"]')!;
    const row = band.querySelector('[data-testid="ground-brush-raise"]')!.closest('.flex-wrap')!.parentElement!;

    expect(row.querySelector('[data-testid="ground-brush-undo"]')).not.toBeNull();
    expect(row.querySelector('[data-testid="ground-brush-close"]')).not.toBeNull();
    expect(row.contains(band.querySelector('[data-testid="ground-brush-hint"]'))).toBe(false);
    expect(band.querySelector('[data-testid="ground-brush-close"]')!.getAttribute('aria-label')).toBe(
      '地面の編集を終える'
    );
  });

  it('says how wide and how hard the brush is, a raise or a cut as a height and the rest as a share', () => {
    brush.active.set(true);
    brush.settings.update((settings) => ({ ...settings, kind: 'raise', radius: 2, strength: 0.3 }));
    let band = render();
    expect(band.querySelector('[data-testid="ground-brush-radius-value"]')!.textContent).toContain('半径2マス');
    expect(band.querySelector('[data-testid="ground-brush-strength-value"]')!.textContent).toContain('0.3マス');

    brush.settings.update((settings) => ({ ...settings, kind: 'smooth' }));
    band = render();
    expect(band.querySelector('[data-testid="ground-brush-strength-value"]')!.textContent).toContain('30%');
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
