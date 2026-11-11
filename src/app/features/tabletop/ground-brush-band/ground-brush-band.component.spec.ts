import { TestBed } from '@angular/core/testing';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { GroundService } from '@axe/application/tabletop/ground.service';
import { GroundBrushService } from '@axe/application/tabletop/ground-brush.service';
import { TableSurfaceService } from '@axe/application/tabletop/table-surface.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { ViewportService } from '@axe/application/ui/viewport.service';
import { ADOPT_TOUCH_EVENT, type AdoptedTouch } from '@axe/features/tabletop/game-table/table-touch-gesture';
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
    const fingers = [...guide().children].map((item) => item.textContent!.replace(/\s+/g, ' ').trim());
    expect(fingers).toEqual([
      '指でなぞる地面を変える',
      '2本指で触れて1本を離し、滑らせる動かす',
      '2本指でひねる回す',
      '2本指で上下傾ける',
      '2本指で広げる・狭める寄る・引く',
    ]);
  });

  describe('with two fingers on the table', () => {
    let table: HTMLElement;
    let adopted: CustomEvent<AdoptedTouch>[];
    let reachedTable: number[];

    beforeEach(() => {
      table = document.createElement('div');
      table.id = 'app-table-layer';
      document.body.append(table);
      adopted = [];
      reachedTable = [];
      table.addEventListener(ADOPT_TOUCH_EVENT, (event) => adopted.push(event as CustomEvent<AdoptedTouch>));
      table.addEventListener('pointerdown', (event) => reachedTable.push(event.pointerId));
      brush.active.set(true);
      render();
      TestBed.tick();
      vi.spyOn(TestBed.inject(TableSurfaceService), 'pointOn').mockImplementation(
        (_surface, x, y) =>
          ({
            localX: x,
            localY: y,
          }) as never
      );
      vi.spyOn(TestBed.inject(TabletopService), 'currentTableVersion').mockReturnValue({ gridSize: 50 } as never);
      vi.spyOn(TestBed.inject(GroundService), 'heightPxAt').mockReturnValue(0);
      for (const step of ['begin', 'dab', 'cancel'] as const) vi.spyOn(brush, step).mockImplementation(() => {});
    });

    afterEach(() => table.remove());

    const finger = (type: string, pointerId: number, x: number, y = 100) =>
      table.dispatchEvent(
        new PointerEvent(type, { bubbles: true, pointerId, pointerType: 'touch', button: 0, clientX: x, clientY: y })
      );

    it('takes the stroke back once a second finger comes down, handing both fingers to the view', () => {
      const begin = vi.mocked(brush.begin);
      const cancel = vi.mocked(brush.cancel);

      finger('pointerdown', 1, 100);
      finger('pointermove', 1, 140);
      expect(begin).toHaveBeenCalledTimes(1);
      expect(reachedTable).toEqual([]);

      finger('pointerdown', 2, 300);

      expect(cancel).toHaveBeenCalledTimes(1);
      expect(adopted.map((event) => event.detail)).toEqual([{ pointerId: 1, clientX: 140, clientY: 100 }]);
      expect(reachedTable).toEqual([2]);
    });

    it('shapes no ground while a finger handed to the view stays down, and again once every one is lifted', () => {
      const begin = vi.mocked(brush.begin);
      const dab = vi.mocked(brush.dab);
      finger('pointerdown', 1, 100);
      finger('pointerdown', 2, 300);

      finger('pointermove', 1, 400);
      finger('pointerup', 2, 300);
      finger('pointerdown', 3, 200);
      expect(dab).not.toHaveBeenCalled();
      expect(begin).toHaveBeenCalledTimes(1);
      expect(reachedTable).toEqual([2, 3]);

      finger('pointerup', 1, 400);
      finger('pointerup', 3, 200);
      finger('pointerdown', 4, 100);
      expect(begin).toHaveBeenCalledTimes(2);
    });
  });

  it('keeps the presses that take back and close at the end of the row of what the brush does', () => {
    brush.active.set(true);
    const band = render().querySelector('[data-testid="ground-brush-band"]')!;
    const row = band.querySelector('[data-testid="ground-brush-row"]')!;
    expect(row.contains(band.querySelector('[data-testid="ground-brush-raise"]'))).toBe(true);

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

  it('gives the keys back to the view once a press of the band is clicked, but not once it is pressed from the keys', () => {
    brush.active.set(true);
    const band = render().querySelector<HTMLElement>('[data-testid="ground-brush-band"]')!;
    document.body.append(band);
    const smooth = band.querySelector<HTMLButtonElement>('[data-testid="ground-brush-smooth"]')!;

    smooth.focus();
    smooth.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(document.activeElement).not.toBe(smooth);

    smooth.focus();
    smooth.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
    expect(document.activeElement).toBe(smooth);
    band.remove();
  });

  it('marks the ground chosen to paint as the kind chosen is marked, and names the groups of presses', () => {
    brush.active.set(true);
    brush.settings.update((settings) => ({ ...settings, kind: 'paint', layer: 'rock' }));
    const band = render();

    expect(
      band.querySelector('[data-testid="ground-brush-layer-rock"]')!.classList.contains('bg-ui-accent-solid')
    ).toBe(true);
    expect([...band.querySelectorAll('[role="group"]')].map((group) => group.getAttribute('aria-label'))).toEqual([
      'ブラシの種類',
      '塗る地面',
    ]);
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
