import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ContextMenuAction, ContextMenuService } from '@axe/application/ui/context-menu.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { FourWayRadialMenuComponent } from '@axe/ui/components/four-way-radial-menu/four-way-radial-menu.component';

describe('FourWayRadialMenuComponent', () => {
  let fixture: ComponentFixture<FourWayRadialMenuComponent>;
  let service: ContextMenuService;

  const buttons = (): HTMLButtonElement[] =>
    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'));
  const buttonContaining = (text: string): HTMLButtonElement => {
    const button = buttons().find((candidate) => candidate.textContent?.includes(text));
    expect(button).toBeDefined();
    return button!;
  };
  const buttonWithLabel = (label: string): HTMLButtonElement => {
    const button = buttons().find((candidate) => candidate.getAttribute('aria-label') === label);
    expect(button).toBeDefined();
    return button!;
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [FourWayRadialMenuComponent] }).compileComponents();
    service = TestBed.inject(ContextMenuService);
    service.title = 'Hero';
    service.position = { x: 300, y: 300 };
    service.actions = [];
    service.radialGroups = [];
    service.radialMenuEnabled = true;
    service.radialMenuRotationSpeed = 5;
    service.radialMenuClearanceRadius = 0;
    service.radialMenuOcclusionHalfExtent = 0;
    service.rotationDegrees = 0;
    service.radialAnchorPosition = null;
  });

  function createWithGroups(groups: { name: string; icon: string; actions: ContextMenuAction[] }[]): void {
    service.radialGroups = groups;
    fixture = TestBed.createComponent(FourWayRadialMenuComponent);
    fixture.detectChanges();
  }

  function chooseSeat(label: string): void {
    const button = buttons().find((candidate) => candidate.getAttribute('aria-label') === label);
    expect(button).toBeDefined();
    button!.click();
    fixture.detectChanges();
  }

  it('opens the rotating menu directly when radial display is enabled', () => {
    createWithGroups([{ name: '表示', icon: 'visibility', actions: [{ name: '詳細', action: vi.fn() }] }]);
    const labels = buttons().map((button) => button.getAttribute('aria-label'));
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-radial-ring]')).toBeTruthy();
    expect(buttonContaining('表示')).toBeTruthy();
    expect(buttonContaining('閉じる')).toBeTruthy();
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('[data-radial-parent]')).toHaveLength(1);
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('[data-radial-child]')).toHaveLength(1);
    expect(labels).not.toContain('南側から操作');
  });

  it('shows fixed snap boundaries and the resulting four panel directions', () => {
    createWithGroups([
      { name: 'North', icon: 'north', actions: [{ name: 'North action', action: vi.fn() }] },
      { name: 'East', icon: 'east', actions: [{ name: 'East action', action: vi.fn() }] },
      { name: 'South', icon: 'south', actions: [{ name: 'South action', action: vi.fn() }] },
      { name: 'West', icon: 'west', actions: [{ name: 'West action', action: vi.fn() }] },
    ]);

    const root = fixture.nativeElement as HTMLElement;
    const guide = root.querySelector<SVGElement>('[data-radial-direction-guide]')!;
    const boundaries = Array.from(guide.querySelectorAll<SVGLineElement>('[data-radial-guide-boundary]'));
    const directions = Array.from(guide.querySelectorAll<SVGGElement>('[data-radial-guide-direction]'));
    const radius = Number(guide.getAttribute('viewBox')?.split(' ')[2]) / 2;

    expect(boundaries).toHaveLength(4);
    expect(boundaries.every((line) => line.getAttribute('x1') === `${radius}`)).toBe(true);
    expect(boundaries.every((line) => line.getAttribute('y1') === `${radius}`)).toBe(true);
    expect(boundaries.every((line) => line.classList.contains('stroke-ui-accent'))).toBe(true);
    expect(boundaries.every((line) => line.getAttribute('stroke-dasharray') === '4 5')).toBe(true);
    expect(directions.map((direction) => Number(direction.dataset['panelRotation']))).toEqual([180, 270, 0, 90]);
  });

  it('masks the dotted boundaries where they pass behind a piece', () => {
    service.radialMenuOcclusionHalfExtent = 25;
    createWithGroups([{ name: 'Display', icon: 'visibility', actions: [{ name: 'Action', action: vi.fn() }] }]);

    const guide = (fixture.nativeElement as HTMLElement).querySelector<SVGElement>('[data-radial-direction-guide]')!;
    const occlusion = guide.querySelector<SVGRectElement>('[data-radial-guide-piece-occlusion]')!;
    const radius = Number(guide.getAttribute('viewBox')?.split(' ')[2]) / 2;

    expect(occlusion.getAttribute('x')).toBe(`${radius - 27}`);
    expect(occlusion.getAttribute('y')).toBe(`${radius - 27}`);
    expect(occlusion.getAttribute('width')).toBe('54');
    expect(occlusion.getAttribute('height')).toBe('54');
  });

  it('does not mask the guide center after a piece menu is dragged elsewhere', () => {
    service.radialMenuOcclusionHalfExtent = 25;
    service.radialAnchorPosition = { x: 120, y: 140 };
    createWithGroups([{ name: 'Display', icon: 'visibility', actions: [{ name: 'Action', action: vi.fn() }] }]);

    expect((fixture.nativeElement as HTMLElement).querySelector('[data-radial-guide-piece-occlusion]')).toBeNull();
  });

  it('closes the rotating menu from its return item at the top level', () => {
    const close = vi.spyOn(service, 'close').mockImplementation(() => undefined);
    createWithGroups([{ name: '表示', icon: 'visibility', actions: [{ name: '詳細', action: vi.fn() }] }]);

    const returnButton = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-radial-return]'
    )!;
    expect(returnButton.getAttribute('aria-label')).toBe('閉じる');
    expect(returnButton.querySelector('.material-icons')?.textContent?.trim()).toBe('close');

    returnButton.click();

    expect(close).toHaveBeenCalledOnce();
  });

  it('uses the rotating display setting supplied immediately after component creation', () => {
    service.radialMenuEnabled = false;
    service.radialGroups = [{ name: '表示', icon: 'visibility', actions: [{ name: '詳細', action: vi.fn() }] }];
    fixture = TestBed.createComponent(FourWayRadialMenuComponent);
    service.radialMenuEnabled = true;
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('[data-radial-ring]')).toBeTruthy();
    expect(buttons().some((button) => button.getAttribute('aria-label') === '南側から操作')).toBe(false);
  });

  it('keeps the four direction launcher when radial display is disabled', () => {
    service.radialMenuEnabled = false;
    createWithGroups([]);
    const labels = buttons().map((button) => button.getAttribute('aria-label'));
    expect(labels).toEqual(['閉じる', '北側から操作', '東側から操作', '南側から操作', '西側から操作']);
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-radial-ring]')).toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-radial-direction-guide]')).toBeNull();
  });

  it('draws the connector from a detached piece anchor to the apparent menu center', () => {
    service.radialAnchorPosition = { x: 120, y: 140 };
    createWithGroups([]);

    const marker = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('[data-piece-right-drag-center]')!;
    const connector = (fixture.nativeElement as HTMLElement).querySelector('line')!;
    expect(marker.classList.contains('piece-right-drag-center')).toBe(true);
    expect(marker.style.left).toBe('300px');
    expect(marker.style.top).toBe('300px');
    expect(connector.getAttribute('x1')).toBe('120');
    expect(connector.getAttribute('y1')).toBe('140');
    expect(connector.getAttribute('x2')).toBe('300');
    expect(connector.getAttribute('y2')).toBe('300');
  });

  it('extends the connector to the screen-corrected center when the dragged center is near an edge', () => {
    service.position = { x: 1, y: 1 };
    service.radialAnchorPosition = { x: 300, y: 300 };
    createWithGroups([]);

    const root = fixture.nativeElement as HTMLElement;
    const connector = root.querySelector('line')!;
    const marker = root.querySelector<HTMLElement>('[data-piece-right-drag-center]')!;
    expect(connector.getAttribute('x1')).toBe('300');
    expect(connector.getAttribute('y1')).toBe('300');
    expect(Number(connector.getAttribute('x2'))).toBeGreaterThan(1);
    expect(Number(connector.getAttribute('y2'))).toBeGreaterThan(1);
    expect(marker.style.left).toBe(`${connector.getAttribute('x2')}px`);
    expect(marker.style.top).toBe(`${connector.getAttribute('y2')}px`);
  });

  it('does not add the right-drag center marker to an ordinary piece menu', () => {
    createWithGroups([]);

    expect((fixture.nativeElement as HTMLElement).querySelector('[data-piece-right-drag-center]')).toBeNull();
  });

  it('moves direction launchers away from a large piece', () => {
    service.radialMenuEnabled = false;
    service.radialMenuClearanceRadius = 100;
    createWithGroups([]);

    const north = buttons().find((button) => button.getAttribute('aria-label') === '北側から操作');
    expect(north?.style.top).toBe('172px');
  });

  it('increases the rotating ring radius by the large-piece clearance', () => {
    service.radialMenuClearanceRadius = 100;
    createWithGroups([{ name: 'North', icon: 'north', actions: [{ name: 'Action', action: vi.fn() }] }]);

    const parent = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-radial-parent]')!;
    const label = parent.querySelector<HTMLElement>('[data-radial-parent-label]')!;
    expect(parent.style.width).toBe('392px');
    expect(label.style.top).toBe('28px');
  });

  it('shows and executes a single child action using its parent direction', () => {
    const action = vi.fn();
    const close = vi.spyOn(service, 'close').mockImplementation(() => undefined);
    const runPanelWithRotation = vi
      .spyOn(TestBed.inject(PanelService), 'runWithInitialRotation')
      .mockImplementation((_degrees, callback) => callback());
    const runModalWithRotation = vi
      .spyOn(TestBed.inject(ModalService), 'runWithInitialRotation')
      .mockImplementation((_degrees, callback) => callback());
    createWithGroups([{ name: '基本情報', icon: 'badge', actions: [{ name: '詳細を表示', action }] }]);

    expect(buttonWithLabel('詳細を表示')).toBeTruthy();
    buttonWithLabel('詳細を表示').click();

    expect(action).toHaveBeenCalledOnce();
    expect(runPanelWithRotation).toHaveBeenCalledWith(180, expect.any(Function));
    expect(runModalWithRotation).toHaveBeenCalledWith(180, action);
    expect(close).toHaveBeenCalledOnce();
  });

  it('uses the direction of the specific category that was clicked', () => {
    const eastAction = vi.fn();
    vi.spyOn(service, 'close').mockImplementation(() => undefined);
    const runWithRotation = vi
      .spyOn(TestBed.inject(PanelService), 'runWithInitialRotation')
      .mockImplementation((_degrees, callback) => callback());
    createWithGroups([
      { name: 'North', icon: 'north', actions: [{ name: 'North action', action: vi.fn() }] },
      { name: 'East', icon: 'east', actions: [{ name: 'East action', action: eastAction }] },
      { name: 'South', icon: 'south', actions: [{ name: 'South action', action: vi.fn() }] },
      { name: 'West', icon: 'west', actions: [{ name: 'West action', action: vi.fn() }] },
    ]);

    buttonWithLabel('East action').click();

    expect(runWithRotation).toHaveBeenCalledWith(270, expect.any(Function));
  });

  it('combines the clicked item direction with the rotating ring direction', () => {
    const action = vi.fn();
    vi.spyOn(service, 'close').mockImplementation(() => undefined);
    const runWithRotation = vi
      .spyOn(TestBed.inject(PanelService), 'runWithInitialRotation')
      .mockImplementation((_degrees, callback) => callback());
    createWithGroups([{ name: '基本情報', icon: 'badge', actions: [{ name: '詳細を表示', action }] }]);
    const ring = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('[data-radial-ring]')!;
    ring.style.transform = 'matrix(0, 1, -1, 0, 0, 0)';

    buttonWithLabel('詳細を表示').click();

    expect(runWithRotation).toHaveBeenCalledWith(270, expect.any(Function));
  });

  it('rotates the ring slowly with each item facing outward', () => {
    createWithGroups([
      { name: 'North', icon: 'north', actions: [{ name: 'Action 1', action: vi.fn() }] },
      { name: 'East', icon: 'east', actions: [{ name: 'Action 2', action: vi.fn() }] },
      { name: 'South', icon: 'south', actions: [{ name: 'Action 3', action: vi.fn() }] },
      { name: 'West', icon: 'west', actions: [{ name: 'Action 4', action: vi.fn() }] },
    ]);
    const ring = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('[data-radial-ring]');
    const labelTransform = (label: string): string =>
      buttonWithLabel(label).querySelector<HTMLElement>('[data-radial-parent-label]')!.style.transform;
    expect(ring?.classList.contains('animate-radial-orbit')).toBe(true);
    expect(ring?.style.animationDuration).toBe('72s');
    expect(buttonWithLabel('North').classList.contains('radial-menu-sector')).toBe(true);
    expect(buttonWithLabel('North').style.clipPath).toMatch(/^polygon\(/);
    expect(labelTransform('North')).toBe('translate(-50%, -50%) rotate(180deg)');
    expect(labelTransform('East')).toBe('translate(-50%, -50%) rotate(252deg)');
    expect(labelTransform('South')).toBe('translate(-50%, -50%) rotate(324deg)');
    expect(labelTransform('West')).toBe('translate(-50%, -50%) rotate(36deg)');
    expect(labelTransform('閉じる')).toBe('translate(-50%, -50%) rotate(108deg)');
  });

  it('uses the configured table rotation speed', () => {
    service.radialMenuRotationSpeed = 10;
    createWithGroups([{ name: 'Display', icon: 'visibility', actions: [{ name: 'Action', action: vi.fn() }] }]);

    const ring = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('[data-radial-ring]')!;
    expect(ring.style.animationDuration).toBe('36s');
  });

  it('allows rotation speeds up to twenty-four degrees per second', () => {
    service.radialMenuRotationSpeed = 99;
    createWithGroups([{ name: 'Display', icon: 'visibility', actions: [{ name: 'Action', action: vi.fn() }] }]);

    const ring = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('[data-radial-ring]')!;
    expect(ring.style.animationDuration).toBe('15s');
  });

  it('leaves the piece center clear without legacy controls', () => {
    createWithGroups([{ name: 'Display', icon: 'visibility', actions: [{ name: 'Action', action: vi.fn() }] }]);

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-radial-center]')).toBeNull();
    expect(root.querySelector('[aria-label="時計回りに90度回転"]')).toBeNull();
    expect(root.querySelector('[aria-label="すべての項目を一覧表示"]')).toBeNull();
  });

  it('turns the existing rotating menu by 45 degrees when it is right-clicked again', () => {
    const close = vi.spyOn(service, 'close').mockImplementation(() => undefined);
    createWithGroups([
      { name: 'Display', icon: 'visibility', actions: [{ name: 'Action', action: vi.fn() }] },
      { name: 'Object', icon: 'settings', actions: [{ name: 'Action', action: vi.fn() }] },
    ]);
    const root = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('[role="dialog"]')!;
    const ring = root.querySelector<HTMLElement>('[data-radial-ring]')!;

    root.dispatchEvent(
      new MouseEvent('pointerdown', { button: 2, clientX: 300, clientY: 300, bubbles: true, cancelable: true })
    );
    root.dispatchEvent(
      new MouseEvent('contextmenu', { button: 2, clientX: 300, clientY: 300, bubbles: true, cancelable: true })
    );
    fixture.detectChanges();

    expect(close).not.toHaveBeenCalled();
    expect(ring.style.rotate).toBe('45deg');

    root.dispatchEvent(
      new MouseEvent('contextmenu', { button: 2, clientX: 300, clientY: 300, bubbles: true, cancelable: true })
    );
    fixture.detectChanges();
    expect(ring.style.rotate).toBe('90deg');

    for (let index = 0; index < 6; index++) {
      root.dispatchEvent(
        new MouseEvent('contextmenu', { button: 2, clientX: 300, clientY: 300, bubbles: true, cancelable: true })
      );
    }
    fixture.detectChanges();
    expect(ring.style.rotate).toBe('360deg');
    expect(ring.classList.contains('transition-[rotate]')).toBe(true);
    expect(ring.classList.contains('duration-180')).toBe(true);

    let reenableTransition: FrameRequestCallback | undefined;
    const requestAnimationFrame = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => ((reenableTransition = callback), 1));
    ring.dispatchEvent(Object.assign(new Event('transitionend', { bubbles: true }), { propertyName: 'rotate' }));
    fixture.detectChanges();
    expect(ring.style.rotate).toBe('0deg');
    expect(ring.style.transition).toBe('none');

    reenableTransition?.(0);
    fixture.detectChanges();
    expect(ring.style.transition).toBe('');
    requestAnimationFrame.mockRestore();
  });

  it('keeps the forced turn at 45 degrees when the ring has only two displayed items', () => {
    createWithGroups([{ name: 'Only group', icon: 'category', actions: [{ name: 'Action', action: vi.fn() }] }]);
    const root = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('[role="dialog"]')!;
    const ring = root.querySelector<HTMLElement>('[data-radial-ring]')!;

    root.dispatchEvent(new MouseEvent('contextmenu', { button: 2, bubbles: true, cancelable: true }));
    fixture.detectChanges();

    expect(ring.style.rotate).toBe('45deg');
  });

  it('keeps the forced turn at 45 degrees when the ring has eight displayed items', () => {
    const groups = Array.from({ length: 7 }, (_, index) => ({
      name: `Group ${index + 1}`,
      icon: 'category',
      actions: [{ name: 'Action', action: vi.fn() }],
    }));
    createWithGroups(groups);
    const root = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('[role="dialog"]')!;
    const ring = root.querySelector<HTMLElement>('[data-radial-ring]')!;

    root.dispatchEvent(new MouseEvent('contextmenu', { button: 2, bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(ring.style.rotate).toBe('45deg');

    for (let index = 1; index < 8; index++) {
      root.dispatchEvent(new MouseEvent('contextmenu', { button: 2, bubbles: true, cancelable: true }));
    }
    fixture.detectChanges();

    expect(ring.style.rotate).toBe('360deg');
  });

  it('passes a right-clicked one-item turn to a panel opened from the menu', () => {
    const action = vi.fn();
    vi.spyOn(service, 'close').mockImplementation(() => undefined);
    const runWithRotation = vi
      .spyOn(TestBed.inject(PanelService), 'runWithInitialRotation')
      .mockImplementation((_degrees, callback) => callback());
    createWithGroups([
      { name: '基本情報', icon: 'badge', actions: [{ name: '詳細を表示', action }] },
      { name: '表示', icon: 'visibility', actions: [{ name: '表示設定', action: vi.fn() }] },
    ]);

    const root = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('[role="dialog"]')!;
    root.dispatchEvent(new MouseEvent('contextmenu', { button: 2, bubbles: true, cancelable: true }));
    fixture.detectChanges();
    buttonWithLabel('詳細を表示').click();

    expect(runWithRotation).toHaveBeenCalledWith(270, expect.any(Function));
  });

  it('pauses for three seconds when a parent is clicked and extends the pause when clicked again', () => {
    vi.useFakeTimers();
    try {
      createWithGroups([
        { name: 'North', icon: 'north', actions: [{ name: 'Action 1', action: vi.fn() }] },
        { name: 'East', icon: 'east', actions: [{ name: 'Action 2', action: vi.fn() }] },
        { name: 'South', icon: 'south', actions: [{ name: 'Action 3', action: vi.fn() }] },
        { name: 'West', icon: 'west', actions: [{ name: 'Action 4', action: vi.fn() }] },
      ]);
      const parent = buttonWithLabel('East');
      parent.click();
      fixture.detectChanges();

      const ring = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('[data-radial-ring]')!;
      expect(ring.style.animationPlayState).toBe('paused');
      expect(parent.getAttribute('aria-pressed')).toBe('true');

      vi.advanceTimersByTime(2500);
      parent.click();
      vi.advanceTimersByTime(1000);
      fixture.detectChanges();
      expect(ring.style.animationPlayState).toBe('paused');

      vi.advanceTimersByTime(2000);
      fixture.detectChanges();
      expect(ring.style.animationPlayState).toBe('running');
      expect(parent.getAttribute('aria-pressed')).toBe('false');
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows every first-level child immediately in a rectangular list outside its parent', () => {
    createWithGroups([
      {
        name: '表示',
        icon: 'visibility',
        actions: [
          { name: 'Action 1', action: vi.fn() },
          { name: 'Action 2', action: vi.fn() },
          { name: 'Action 3', action: vi.fn() },
        ],
      },
    ]);

    const root = fixture.nativeElement as HTMLElement;
    const listAnchor = root.querySelector<HTMLElement>('[data-radial-child-list]')!;
    const list = listAnchor.querySelector<HTMLElement>('[data-radial-child-items]')!;
    const children = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-radial-child]'));
    const gaps = Array.from(root.querySelectorAll<HTMLElement>('[data-radial-child-item-gap]'));

    expect(children.map((button) => button.getAttribute('aria-label'))).toEqual(['Action 1', 'Action 2', 'Action 3']);
    expect(root.querySelectorAll('[data-radial-child-list]')).toHaveLength(1);
    expect(listAnchor.style.top).toBe('-174px');
    expect(listAnchor.style.rotate).toBe('180deg');
    expect(list.classList.contains('flex-col')).toBe(true);
    expect(list.style.width).toBe('128px');
    expect(list.classList.contains('bg-ui-menu')).toBe(false);
    expect(list.classList.contains('border')).toBe(false);
    expect(list.classList.contains('shadow-ui-lg')).toBe(false);
    expect(gaps).toHaveLength(2);
    expect(gaps.every((gap) => gap.style.height === '2px')).toBe(true);
    expect(children.every((button) => button.classList.contains('radial-child-menu-item'))).toBe(true);
    expect(children.every((button) => button.classList.contains('radial-child-menu-item-detached'))).toBe(true);
    expect(children.every((button) => button.classList.contains('rounded-ui-sm'))).toBe(true);
    expect(children.every((button) => button.classList.contains('bg-ui-menu'))).toBe(true);
    expect(children.every((button) => button.classList.contains('border'))).toBe(true);
    expect(children.every((button) => !button.classList.contains('radial-menu-sector'))).toBe(true);
    expect(children.every((button) => button.style.clipPath === '')).toBe(true);

    buttonWithLabel('表示').click();
    fixture.detectChanges();
    expect(root.querySelectorAll('[data-radial-child]')).toHaveLength(3);
  });

  it('opens grandchildren in a fixed bar menu beside the selected child', () => {
    createWithGroups([
      {
        name: '表示',
        icon: 'visibility',
        actions: [
          {
            name: '高度設定',
            subActions: [
              { name: '影を表示する', action: vi.fn() },
              { name: '高度を固定する', action: vi.fn() },
            ],
          },
          { name: 'インベントリ非表示', action: vi.fn() },
        ],
      },
    ]);
    const child = buttonWithLabel('高度設定');
    vi.spyOn(child, 'getBoundingClientRect').mockReturnValue({
      x: 120,
      y: 90,
      left: 120,
      top: 90,
      right: 220,
      bottom: 130,
      width: 100,
      height: 40,
      toJSON: () => ({}),
    });

    child.click();
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const ring = root.querySelector<HTMLElement>('[data-radial-ring]')!;
    const anchor = root.querySelector<HTMLElement>('[data-radial-flyout-anchor]')!;
    expect(anchor.style.left).toBe('220px');
    expect(anchor.style.top).toBe('110px');
    expect(anchor.style.rotate).toBe('180deg');
    expect(anchor.textContent).toContain('影を表示する');
    const flyoutRoot = anchor.querySelector<HTMLElement>('[data-context-menu-root]')!;
    const flyoutItems = Array.from(flyoutRoot.querySelectorAll<HTMLElement>('[data-context-menu-item]'));
    const flyoutGaps = Array.from(flyoutRoot.querySelectorAll<HTMLElement>('[data-context-menu-item-gap]'));
    expect(flyoutRoot.dataset['detachedItems']).toBe('true');
    expect(flyoutRoot.classList.contains('bg-ui-menu')).toBe(false);
    expect(flyoutRoot.classList.contains('border')).toBe(false);
    expect(flyoutItems).toHaveLength(2);
    expect(flyoutItems.every((item) => item.classList.contains('bg-ui-menu'))).toBe(true);
    expect(flyoutItems.every((item) => item.classList.contains('rounded-ui-sm'))).toBe(true);
    expect(flyoutGaps).toHaveLength(1);
    expect(flyoutGaps[0]?.style.height).toBe('2px');
    expect(ring.style.animationPlayState).toBe('paused');
    expect(buttonWithLabel('表示')).toBeTruthy();
    expect(buttonWithLabel('インベントリ非表示')).toBeTruthy();

    child.click();
    fixture.detectChanges();
    expect(root.querySelector('[data-radial-flyout-anchor]')).toBeNull();
    expect(ring.style.animationPlayState).toBe('running');
  });

  it('keeps the ring paused while a grandchild menu is open after the parent pause expires', () => {
    vi.useFakeTimers();
    try {
      createWithGroups([
        {
          name: '表示',
          icon: 'visibility',
          actions: [{ name: '高度設定', subActions: [{ name: '影を表示する', action: vi.fn() }] }],
        },
      ]);
      const ring = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('[data-radial-ring]')!;
      buttonWithLabel('表示').click();
      buttonWithLabel('高度設定').click();
      fixture.detectChanges();

      vi.advanceTimersByTime(3000);
      fixture.detectChanges();
      expect(ring.style.animationPlayState).toBe('paused');

      buttonWithLabel('高度設定').click();
      fixture.detectChanges();
      expect(ring.style.animationPlayState).toBe('running');
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows all first-level children without radial paging', () => {
    const actions = Array.from({ length: 15 }, (_, index) => ({
      name: `Action ${index + 1}`,
      action: vi.fn(),
    }));
    createWithGroups([{ name: '表示', icon: 'visibility', actions }]);

    const children = (fixture.nativeElement as HTMLElement).querySelectorAll('[data-radial-child]');
    expect(children).toHaveLength(15);
    expect(buttonWithLabel('Action 1')).toBeTruthy();
    expect(buttonWithLabel('Action 15')).toBeTruthy();
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-radial-page-advance]')).toBeNull();
  });

  it('renders checkbox, radio and selected prefixes as state icons', () => {
    createWithGroups([
      {
        name: '表示',
        icon: 'visibility',
        actions: [
          { name: '☑ 名前を表示', action: vi.fn() },
          { name: '☐ 外周表示', action: vi.fn() },
          { name: '◉ 高速', action: vi.fn() },
          { name: '○ 低速', action: vi.fn() },
          { name: '✔ 選択中', action: vi.fn() },
          { name: '通常項目', action: vi.fn() },
        ],
      },
    ]);

    const state = (label: string): { button: HTMLButtonElement; icon: string | undefined } => {
      const button = buttonWithLabel(label);
      return {
        button,
        icon: button.querySelector<HTMLElement>('[data-radial-state-icon]')?.textContent?.trim(),
      };
    };

    expect(state('名前を表示').icon).toBe('check_box');
    expect(state('名前を表示').button.getAttribute('aria-pressed')).toBe('true');
    expect(state('外周表示').icon).toBe('check_box_outline_blank');
    expect(state('外周表示').button.getAttribute('aria-pressed')).toBe('false');
    expect(state('高速').icon).toBe('radio_button_checked');
    expect(state('低速').icon).toBe('radio_button_unchecked');
    expect(state('選択中').icon).toBe('check');
    expect(state('通常項目').icon).toBeUndefined();
    expect(buttons().some((button) => button.textContent?.includes('☑'))).toBe(false);
  });

  it.each([
    ['北側から操作', { x: 300, y: 230 }, 180],
    ['東側から操作', { x: 370, y: 300 }, 270],
    ['南側から操作', { x: 300, y: 370 }, 0],
    ['西側から操作', { x: 230, y: 300 }, 90],
  ] as const)('opens the legacy menu outside the piece from %s', (label, position, rotation) => {
    const open = vi.spyOn(service, 'openDirectional').mockImplementation(() => undefined);
    service.radialMenuEnabled = false;
    service.actions = [{ name: 'Complete action', action: vi.fn() }];
    createWithGroups([{ name: '基本情報', icon: 'badge', actions: service.actions }]);

    chooseSeat(label);

    expect(open).toHaveBeenCalledWith(position, service.actions, rotation, 'Hero');
  });

  it('uses the large-piece clearance when placing the legacy menu', () => {
    const open = vi.spyOn(service, 'openDirectional').mockImplementation(() => undefined);
    service.radialMenuEnabled = false;
    service.radialMenuClearanceRadius = 100;
    service.actions = [{ name: 'Complete action', action: vi.fn() }];
    createWithGroups([{ name: '基本情報', icon: 'badge', actions: service.actions }]);

    chooseSeat('北側から操作');

    expect(open).toHaveBeenCalledWith({ x: 300, y: 172 }, service.actions, 180, 'Hero');
  });

  it('grows the item boxes together with the font scale', () => {
    createWithGroups([{ name: '表示', icon: 'visibility', actions: [{ name: '詳細', action: vi.fn() }] }]);
    const root = fixture.nativeElement as HTMLElement;
    const smallLabelHeight = root.querySelector<HTMLElement>('[data-radial-parent-label]')!.style.height;
    const smallItemHeight = root.querySelector<HTMLElement>('[data-radial-child]')!.style.minHeight;

    service.fontScale = 1.3;
    createWithGroups([{ name: '表示', icon: 'visibility', actions: [{ name: '詳細', action: vi.fn() }] }]);
    const largeRoot = fixture.nativeElement as HTMLElement;

    expect(largeRoot.firstElementChild!.getAttribute('style')).toContain('--menu-font-scale: 1.3');
    expect(
      parseFloat(largeRoot.querySelector<HTMLElement>('[data-radial-parent-label]')!.style.height)
    ).toBeGreaterThan(parseFloat(smallLabelHeight));
    expect(parseFloat(largeRoot.querySelector<HTMLElement>('[data-radial-child]')!.style.minHeight)).toBeGreaterThan(
      parseFloat(smallItemHeight)
    );
  });

  function branchListWidth(groupNames: string[]): number {
    createWithGroups(
      groupNames.map((name) => ({
        name,
        icon: 'menu',
        actions: [{ name: `${name} action`, action: vi.fn() }],
      }))
    );
    const list = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('[data-radial-child-items]')!;
    return parseFloat(list.style.width);
  }

  it('widens a branch list with the font scale while the ring has room', () => {
    expect(branchListWidth(['A', 'B'])).toBe(128);

    service.fontScale = 1.3;

    expect(branchListWidth(['A', 'B'])).toBe(Math.round(128 * 1.3));
  });

  it('never widens a branch list into its neighbour on a crowded ring', () => {
    // Seven groups plus the return item fill the ring, the most items a rotating menu page holds.
    const groups = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    expect(branchListWidth(groups)).toBe(128);

    service.fontScale = 1.3;

    // That leaves less than the unscaled width between neighbours, so the scale cannot apply at all.
    expect(branchListWidth(groups)).toBe(128);
  });
});
