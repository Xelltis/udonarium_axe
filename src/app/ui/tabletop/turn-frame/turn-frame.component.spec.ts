import { Component, WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { HeldPieceService } from '@axe/application/tabletop/held-piece.service';
import type { HudAnchor } from '@axe/application/tabletop/hud-frame.service';
import { TablePickService } from '@axe/application/tabletop/table-pick.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { ViewportService } from '@axe/application/ui/viewport.service';
import { turnFrame } from '@axe/domain/tabletop/turn-frame';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { RotableDirective } from '@axe/ui/directives/rotable.directive';
import { HudPlaceDirective } from '@axe/ui/tabletop/hud-place.directive';
import { TurnFrameComponent, type TurnStand } from '@axe/ui/tabletop/turn-frame/turn-frame.component';

const STAND: TurnStand = {
  surface: 'floor',
  height: 0,
  foot: { left: 100, top: 100, width: 100, depth: 50, pivot: { x: 150, y: 125 }, rotateDeg: 0 },
};

@Component({
  template: `<div data-hud-box>
    <div appRotable><turn-frame owner="block" [stand]="stand" /></div>
  </div>`,
  imports: [TurnFrameComponent, RotableDirective],
})
class HostComponent {
  stand = STAND;
}

describe('TurnFrameComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let couldHover = true;
  const hoverOf = () =>
    (TestBed.inject(ViewportService) as unknown as { _canHover: WritableSignal<boolean> })._canHover;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    couldHover = hoverOf()();
    hoverOf().set(true);
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    hoverOf().set(couldHover);
    vi.restoreAllMocks();
  });

  const root = () => (fixture.nativeElement as HTMLElement).querySelector('[data-hud-box]')!;
  const frameOf = () => (fixture.nativeElement as HTMLElement).querySelector('[data-testid="turn-frame"]');
  const all = (testId: string) => [
    ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>(`[data-testid="${testId}"]`),
  ];

  function pointerOver(over: boolean): void {
    root().dispatchEvent(new Event(over ? 'pointerover' : 'pointerleave'));
    fixture.detectChanges();
  }

  it('stays in until the pointer is over the thing, where the main pointer can hover, and goes a moment after it leaves', () => {
    vi.useFakeTimers();
    try {
      expect(frameOf()).toBeNull();

      pointerOver(true);
      expect(frameOf()).not.toBeNull();

      pointerOver(false);
      expect(frameOf()).not.toBeNull();
      vi.advanceTimersByTime(1000);
      fixture.detectChanges();
      expect(frameOf()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('stays out where the pointer comes back onto the thing or its frame within that moment', () => {
    vi.useFakeTimers();
    try {
      pointerOver(true);
      pointerOver(false);
      vi.advanceTimersByTime(200);
      pointerOver(true);
      vi.advanceTimersByTime(1000);
      fixture.detectChanges();

      expect(frameOf()).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('lies on the face round the thing’s foot, with a knob at each corner turning it and its front marked', () => {
    pointerOver(true);

    const laid = fixture.debugElement
      .queryAll(By.directive(HudPlaceDirective))
      .map((found) => found.injector.get(HudPlaceDirective).anchor() as HudAnchor)
      .find((anchor) => anchor.lay);
    const frame = turnFrame(STAND.foot);
    expect(laid).toEqual({
      owner: 'block',
      lay: { surface: 'floor', height: 0, corners: frame.corners, width: frame.width, depth: frame.depth },
    });
    expect(all('turn-frame-knob')).toHaveLength(4);
    expect(all('turn-frame-front')).toHaveLength(1);
    for (const grab of [...all('turn-frame-knob'), ...all('turn-frame-line')]) {
      expect(grab.classList).toContain('rotate-grab');
    }
  });

  it('comes out round the thing last pressed alone, where the main pointer cannot hover', () => {
    hoverOf().set(false);
    const selection = TestBed.inject(SelectionSignalService);

    pointerOver(true);
    expect(frameOf()).toBeNull();

    selection.pressObject('another', 'terrain');
    fixture.detectChanges();
    expect(frameOf()).toBeNull();

    selection.pressObject('block', 'terrain');
    fixture.detectChanges();
    expect(frameOf()).not.toBeNull();
  });

  it('is kept but not drawn while the thing is in hand, for a press on it to turn the thing by', () => {
    pointerOver(true);
    TestBed.inject(HeldPieceService).take({ identifier: 'block' } as never);
    fixture.detectChanges();

    expect(frameOf()).not.toBeNull();
    expect(frameOf()!.classList).toContain('opacity-0');
  });

  it('leaves out the knobs the thing itself stands before, the line round behind it, but not its front', () => {
    vi.spyOn(TestBed.inject(TablePickService), 'sightOf').mockReturnValue((_surface, _x, y) => y < STAND.foot.top);

    pointerOver(true);

    expect(all('turn-frame-knob')).toHaveLength(2);
    expect(all('turn-frame-front')).toHaveLength(1);
    expect(all('turn-frame-line')[0].getAttribute('d')).not.toContain('Z');
  });
});
