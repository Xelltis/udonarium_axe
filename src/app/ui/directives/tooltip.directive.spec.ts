import { ChangeDetectionStrategy, Component, DestroyRef, inject, viewChild, ViewContainerRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ObjectChangeService, ObjectDeleteEvent } from '@axe/application/sync/object-change.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { TabletopDisplaySettingsService } from '@axe/application/ui/tabletop-display-settings.service';
import { ViewportService } from '@axe/application/ui/viewport.service';
import { EventChannel } from '@axe/core/event/event-channel';
import { GameCharacter } from '@axe/domain/character/game-character';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { TooltipDirective, TooltipPanelInstance } from '@axe/ui/directives/tooltip.directive';
import { EdgeDetailSeat } from '@axe/ui/tabletop/edge-detail-layout';

@Component({
  selector: 'stub-tooltip-panel',
  template: '<div data-testid="stub-panel"></div>',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class StubTooltipPanelComponent implements TooltipPanelInstance {
  /** The panels on screen, oldest first, so a test can read what the directive built. */
  static readonly instances: StubTooltipPanelComponent[] = [];

  tabletopObject: TabletopObject | null = null;
  left = 0;
  top = 0;
  rotationDegrees = 0;
  edgeSeat: EdgeDetailSeat | null = null;
  placementListener: (() => void) | null = null;
  placementCount = 0;
  pointerHidden = false;
  /** What this panel is pretending to cover, since nothing is laid out in a test. */
  coveredArea: { left: number; top: number; right: number; bottom: number } | null = null;

  constructor() {
    StubTooltipPanelComponent.instances.push(this);
    inject(DestroyRef).onDestroy(() => {
      const index = StubTooltipPanelComponent.instances.indexOf(this);
      if (index >= 0) StubTooltipPanelComponent.instances.splice(index, 1);
    });
  }

  applyEdgePlacement(): void {
    this.placementCount++;
    this.placementListener?.();
  }

  coversPoint(x: number, y: number): boolean {
    const area = this.coveredArea;
    return !!area && area.left <= x && x <= area.right && area.top <= y && y <= area.bottom;
  }

  setPointerHidden(hidden: boolean): void {
    this.pointerHidden = hidden;
  }
}

@Component({
  selector: 'tooltip-test-host',
  template: `
    <div data-testid="first-piece" [appTooltip]="first"><span data-testid="piece-body"></span></div>
    <div data-testid="second-piece" [appTooltip]="second"></div>
    <ng-container #panelHost></ng-container>
  `,
  imports: [TooltipDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class TooltipHostComponent {
  first!: TabletopObject;
  second!: TabletopObject;
  readonly panelHost = viewChild.required('panelHost', { read: ViewContainerRef });
}

const OPEN_WAIT_MS = 160;
const CLOSE_WAIT_MS = 460;
const FOLLOW_WAIT_MS = 360;

describe('TooltipDirective', () => {
  let fixture: ComponentFixture<TooltipHostComponent>;
  let host: TooltipHostComponent;
  let table: GameTable;
  const characters: GameCharacter[] = [];

  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const panels = () => StubTooltipPanelComponent.instances;

  function setViewport(width: number, height: number): void {
    Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true });
    Object.defineProperty(window, 'innerHeight', { value: height, configurable: true, writable: true });
  }

  function makeCharacter(name: string): GameCharacter {
    const character = new GameCharacter(name);
    character.initialize();
    characters.push(character);
    return character;
  }

  async function hover(testId: string, clientX = 0, clientY = 10): Promise<void> {
    const piece = fixture.nativeElement.querySelector(`[data-testid="${testId}"]`) as HTMLElement;
    piece.dispatchEvent(new MouseEvent('mouseenter', { clientX, clientY }));
    await wait(OPEN_WAIT_MS);
    fixture.detectChanges();
  }

  async function unhover(testId: string): Promise<void> {
    const piece = fixture.nativeElement.querySelector(`[data-testid="${testId}"]`) as HTMLElement;
    piece.dispatchEvent(new MouseEvent('mouseleave'));
    await wait(CLOSE_WAIT_MS);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    setViewport(1000, 900);
    TestBed.configureTestingModule({
      imports: [TooltipHostComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();

    TooltipDirective.TooltipPanelComponentClass = StubTooltipPanelComponent;
    fixture = TestBed.createComponent(TooltipHostComponent);
    host = fixture.componentInstance;
    host.first = makeCharacter('先手');
    host.second = makeCharacter('後手');
    fixture.detectChanges();
    await fixture.whenStable();
    ContextMenuService.defaultParentViewContainerRef = host.panelHost();

    table = TestBed.inject(TabletopService).currentTable;
    table.mode2d = true;
    TestBed.inject(TabletopDisplaySettingsService).patch({
      enabled: true,
      hoverDetailPlacement: 'screen-edges',
      multiAngleEnabled: false,
    });
  });

  afterEach(() => {
    fixture.destroy();
    for (const character of characters.splice(0)) character.destroy();
    table.mode2d = false;
    TestBed.inject(TabletopDisplaySettingsService).patch({
      enabled: false,
      hoverDetailPlacement: 'piece',
      multiAngleEnabled: false,
    });
  });

  it('shows one detail per edge seat while the table asks for screen edges', async () => {
    await hover('first-piece');

    expect(panels()).toHaveLength(4);
    expect(fixture.nativeElement.querySelectorAll('[data-testid="stub-panel"]')).toHaveLength(4);
  });

  it('turns each detail toward the edge it belongs to', async () => {
    await hover('first-piece');

    const instances = [...panels()];
    expect(instances.map((instance) => instance.rotationDegrees)).toEqual([0, 90, 180, 270]);
    expect(instances.map((instance) => instance.edgeSeat?.edge)).toEqual(['bottom', 'left', 'top', 'right']);
    expect(instances.every((instance) => instance.tabletopObject === host.first)).toBe(true);
  });

  it('seats two along each long edge of a wide screen', async () => {
    setViewport(1920, 1080);
    await hover('first-piece');

    expect(panels()).toHaveLength(6);
  });

  it('keeps the single detail beside the piece while the table asks for that', async () => {
    TestBed.inject(TabletopDisplaySettingsService).patch({
      hoverDetailPlacement: 'piece',
      multiAngleEnabled: true,
    });
    await hover('first-piece', -10, 0);

    const instances = [...panels()];
    expect(instances).toHaveLength(1);
    expect(instances[0].edgeSeat).toBeNull();
    expect(instances[0].rotationDegrees).toBe(90);
  });

  it('keeps the single upright detail outside 2D mode', async () => {
    table.mode2d = false;
    TestBed.inject(TabletopDisplaySettingsService).patch({ enabled: false });
    await hover('first-piece', -10, 0);

    const instances = [...panels()];
    expect(instances).toHaveLength(1);
    expect(instances[0].edgeSeat).toBeNull();
    expect(instances[0].rotationDegrees).toBe(0);
  });

  it('takes every detail away when the pointer leaves the piece', async () => {
    await hover('first-piece');
    expect(panels()).toHaveLength(4);

    await unhover('first-piece');

    expect(panels()).toHaveLength(0);
  });

  it('takes the details of one piece away when another is hovered', async () => {
    await hover('first-piece');
    await hover('second-piece');

    const instances = [...panels()];
    expect(instances).toHaveLength(4);
    expect(instances.every((instance) => instance.tabletopObject === host.second)).toBe(true);
  });

  it('takes the details away when the piece is deleted', async () => {
    await hover('first-piece');

    const objectChange = TestBed.inject(ObjectChangeService) as unknown as {
      _objectDeleted$: EventChannel<ObjectDeleteEvent>;
    };
    objectChange._objectDeleted$.emit({
      identifier: host.first.identifier,
      aliasName: host.first.aliasName,
      isSendFromSelf: true,
    });
    fixture.detectChanges();

    expect(panels()).toHaveLength(0);
  });

  it('places the details again when the screen changes size but not shape', async () => {
    await hover('first-piece');
    const before = [...panels()];
    const placements = before.map((instance) => instance.placementCount);

    setViewport(1100, 950);
    window.dispatchEvent(new Event('resize'));
    await wait(FOLLOW_WAIT_MS);
    fixture.detectChanges();

    const after = [...panels()];
    expect(after).toEqual(before);
    expect(after.map((instance) => instance.placementCount)).toEqual(placements.map((count) => count + 1));
  });

  it('builds the details again when the screen wants other seats', async () => {
    await hover('first-piece');
    const before = [...panels()];

    setViewport(1920, 1080);
    window.dispatchEvent(new Event('resize'));
    await wait(FOLLOW_WAIT_MS);
    fixture.detectChanges();

    const after = [...panels()];
    expect(after).toHaveLength(6);
    expect(after.some((instance) => before.includes(instance))).toBe(false);
  });

  describe('the detail under the pointer', () => {
    function coverPointerWith(panel: StubTooltipPanelComponent): void {
      panel.coveredArea = { left: 0, top: 0, right: 200, bottom: 200 };
    }

    async function movePointerTo(x: number, y: number): Promise<void> {
      const piece = fixture.nativeElement.querySelector('[data-testid="first-piece"]') as HTMLElement;
      piece.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y }));
      await Promise.resolve();
    }

    it('hides the one detail lying over the pointer', async () => {
      await hover('first-piece');
      const [bottom, left, top, right] = [...panels()];
      coverPointerWith(bottom);

      await movePointerTo(100, 100);

      expect(bottom.pointerHidden).toBe(true);
      expect([left, top, right].map((panel) => panel.pointerHidden)).toEqual([false, false, false]);
    });

    it('shows it again once the pointer moves off it', async () => {
      await hover('first-piece');
      const bottom = panels()[0];
      coverPointerWith(bottom);
      await movePointerTo(100, 100);

      await movePointerTo(400, 400);

      expect(bottom.pointerHidden).toBe(false);
    });

    it('hides no more than one detail, however they overlap', async () => {
      await hover('first-piece');
      const [bottom, left] = [...panels()];
      coverPointerWith(bottom);
      coverPointerWith(left);

      await movePointerTo(100, 100);

      expect(bottom.pointerHidden).toBe(true);
      expect(left.pointerHidden).toBe(false);
    });

    it('brings a hidden detail back when there is no pointer to keep clear of', async () => {
      await hover('first-piece');
      const bottom = panels()[0];
      coverPointerWith(bottom);
      await movePointerTo(100, 100);
      expect(bottom.pointerHidden).toBe(true);

      vi.spyOn(TestBed.inject(ViewportService), 'isTouch').mockReturnValue(true);
      bottom.applyEdgePlacement();

      expect(bottom.pointerHidden).toBe(false);
    });

    it('looks again as soon as a detail has been placed', async () => {
      await hover('first-piece');
      const bottom = panels()[0];
      coverPointerWith(bottom);

      bottom.applyEdgePlacement();

      expect(bottom.pointerHidden).toBe(true);
    });
  });

  it('still goes away when the seats are rebuilt on the way out', async () => {
    await hover('first-piece');
    const piece = fixture.nativeElement.querySelector('[data-testid="first-piece"]') as HTMLElement;
    piece.dispatchEvent(new MouseEvent('mouseleave'));

    setViewport(1920, 1080);
    window.dispatchEvent(new Event('resize'));
    await wait(FOLLOW_WAIT_MS);
    fixture.detectChanges();
    expect(panels()).toHaveLength(6);

    await wait(CLOSE_WAIT_MS);
    fixture.detectChanges();

    expect(panels()).toHaveLength(0);
  });

  it('watches the document and the window once for the whole showing', async () => {
    const bodyAdd = vi.spyOn(document.body, 'addEventListener');
    const bodyRemove = vi.spyOn(document.body, 'removeEventListener');
    const windowAdd = vi.spyOn(window, 'addEventListener');
    const windowRemove = vi.spyOn(window, 'removeEventListener');

    await hover('first-piece');

    expect(bodyAdd.mock.calls.filter(([type]) => type === 'mousedown')).toHaveLength(1);
    expect(bodyAdd.mock.calls.filter(([type]) => type === 'touchstart')).toHaveLength(1);
    expect(windowAdd.mock.calls.filter(([type]) => type === 'resize')).toHaveLength(1);

    await unhover('first-piece');

    expect(bodyRemove.mock.calls.filter(([type]) => type === 'mousedown')).toHaveLength(1);
    expect(bodyRemove.mock.calls.filter(([type]) => type === 'touchstart')).toHaveLength(1);
    expect(windowRemove.mock.calls.filter(([type]) => type === 'resize')).toHaveLength(1);
    expect(windowRemove.mock.calls.filter(([type]) => type === 'orientationchange')).toHaveLength(1);
  });

  it('leaves nothing listening once the details are gone', async () => {
    await hover('first-piece');
    await unhover('first-piece');

    const placementsBefore = 0;
    setViewport(1920, 1080);
    window.dispatchEvent(new Event('resize'));
    await wait(FOLLOW_WAIT_MS);
    fixture.detectChanges();

    expect(panels()).toHaveLength(placementsBefore);
    document.body.dispatchEvent(new MouseEvent('mousedown'));
    expect(panels()).toHaveLength(0);
  });

  it('takes the details away with the piece they belong to', async () => {
    await hover('first-piece');

    fixture.destroy();

    expect(panels()).toHaveLength(0);

    setViewport(1920, 1080);
    window.dispatchEvent(new Event('resize'));
    await wait(FOLLOW_WAIT_MS);

    expect(panels()).toHaveLength(0);
  });

  it('never asks an edge detail to notice the pointer', async () => {
    const listened: string[] = [];
    const original = Element.prototype.addEventListener;
    const spy = vi.spyOn(Element.prototype, 'addEventListener').mockImplementation(function (
      this: Element,
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | AddEventListenerOptions
    ) {
      if (this.tagName.toLowerCase() === 'stub-tooltip-panel') listened.push(type);
      original.call(this, type, listener as EventListenerOrEventListenerObject, options);
    });

    await hover('first-piece');
    spy.mockRestore();

    expect(listened).toEqual([]);
  });
});
