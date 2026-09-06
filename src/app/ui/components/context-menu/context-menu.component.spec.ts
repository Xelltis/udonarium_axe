import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModalService } from '@axe/application/ui/modal.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import { ContextMenuComponent } from '@axe/ui/components/context-menu/context-menu.component';

describe('ContextMenuComponent', () => {
  let component: ContextMenuComponent;
  let fixture: ComponentFixture<ContextMenuComponent>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [ContextMenuComponent],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ContextMenuComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('keeps the ordinary context menu on one shared panel', () => {
    component.contextMenuService.actions = [
      { name: 'Action 1', action: vi.fn() },
      { name: 'Action 2', action: vi.fn() },
    ];
    fixture.detectChanges();

    const root = component.rootElementRef().nativeElement;
    expect(root.classList.contains('bg-ui-menu')).toBe(true);
    expect(root.classList.contains('border')).toBe(true);
    expect(root.classList.contains('shadow-ui-lg')).toBe(true);
    expect(root.querySelector('[data-context-menu-backdrop]')).toBeTruthy();
    expect(root.querySelectorAll('[data-context-menu-item-gap]')).toHaveLength(0);
  });

  it('renders radial descendants as separate rounded rows with real transparent spacers', () => {
    component.contextMenuService.actions = [
      { name: 'Action 1', action: vi.fn() },
      { name: 'Action 2', action: vi.fn() },
      { name: 'Action 3', action: vi.fn() },
    ];
    fixture.componentRef.setInput('detachedItems', true);
    fixture.detectChanges();

    const root = component.rootElementRef().nativeElement;
    const items = Array.from(root.querySelectorAll<HTMLElement>('[data-context-menu-item]'));
    const gaps = Array.from(root.querySelectorAll<HTMLElement>('[data-context-menu-item-gap]'));
    expect(root.dataset['detachedItems']).toBe('true');
    expect(root.classList.contains('bg-ui-menu')).toBe(false);
    expect(root.classList.contains('border')).toBe(false);
    expect(root.classList.contains('shadow-ui-lg')).toBe(false);
    expect(root.querySelector('[data-context-menu-backdrop]')).toBeNull();
    expect(items).toHaveLength(3);
    expect(items.every((item) => item.classList.contains('bg-ui-menu'))).toBe(true);
    expect(items.every((item) => item.classList.contains('border'))).toBe(true);
    expect(items.every((item) => item.classList.contains('rounded-ui-sm'))).toBe(true);
    expect(gaps).toHaveLength(2);
    expect(gaps.every((gap) => gap.style.height === '2px')).toBe(true);
  });

  it('gives detached altitude controls their own opaque panels', () => {
    const altitudeHandle = { altitude: 1, update: vi.fn() } as unknown as TabletopObject;
    component.contextMenuService.actions = [
      { name: 'Reset altitude', action: vi.fn(), altitudeHandle },
      { name: 'Show altitude', action: vi.fn() },
    ];
    fixture.componentRef.setInput('detachedItems', true);
    fixture.detectChanges();

    const root = component.rootElementRef().nativeElement;
    const sliderPanel = root.querySelector<HTMLElement>('[data-context-menu-altitude-slider-panel]')!;
    const altitudeTitle = root.querySelector<HTMLElement>('[data-context-menu-altitude-title]')!;
    expect(sliderPanel.classList.contains('context-menu-detached-altitude-slider-panel')).toBe(true);
    expect(altitudeTitle.classList.contains('context-menu-detached-altitude-title')).toBe(true);
    expect(root.querySelector<HTMLInputElement>('input[name="altitude"]')).toBeTruthy();
    expect(root.querySelector<HTMLInputElement>('input[name="altitude-number"]')).toBeTruthy();
  });

  it('rotates the complete vertical menu toward the selected side', () => {
    component.contextMenuService.rotationDegrees = 90;
    fixture.detectChanges();

    const root = component.rootElementRef().nativeElement;
    expect(root.style.rotate).toBe('90deg');
    expect(root.style.transformOrigin).toBe('top left');
    expect(root.dataset['menuRotation']).toBe('90');
  });

  it('passes the menu direction to panels and modals opened by an action', () => {
    const action = vi.fn();
    const runPanelWithRotation = vi
      .spyOn(TestBed.inject(PanelService), 'runWithInitialRotation')
      .mockImplementation((_degrees, callback) => callback());
    const runModalWithRotation = vi
      .spyOn(TestBed.inject(ModalService), 'runWithInitialRotation')
      .mockImplementation((_degrees, callback) => callback());
    component.contextMenuService.rotationDegrees = 270;

    component.doAction({ name: 'Open panel', action });

    expect(runPanelWithRotation).toHaveBeenCalledWith(270, expect.any(Function));
    expect(runModalWithRotation).toHaveBeenCalledWith(270, action);
    expect(action).toHaveBeenCalledOnce();
  });

  it('opens a submenu immediately when its parent is clicked', () => {
    const leafAction = vi.fn();
    const parent = {
      name: 'Display',
      subActions: [{ name: 'Hide name', action: leafAction }],
    };
    component.contextMenuService.actions = [parent];
    component.contextMenuService.rotationDegrees = 180;
    fixture.detectChanges();

    const item = fixture.nativeElement.querySelector('li') as HTMLLIElement;
    item.click();
    fixture.detectChanges();

    expect(component.subMenu()).toEqual(parent.subActions);
    const submenu = fixture.nativeElement.querySelector('context-menu');
    expect(submenu).toBeTruthy();
    expect(submenu.textContent).toContain('Hide name');

    const outerAction = vi.spyOn(component, 'doAction');
    const submenuItem = submenu.querySelector('li') as HTMLLIElement;
    submenuItem.click();
    expect(leafAction).toHaveBeenCalledOnce();
    expect(outerAction).not.toHaveBeenCalled();
  });

  it('inherits detached rows in recursively opened descendants', () => {
    const parent = {
      name: 'Display',
      subActions: [
        { name: 'Hide name', action: vi.fn() },
        { name: 'Hide aura', action: vi.fn() },
      ],
    };
    fixture.componentRef.setInput('isSubmenu', true);
    fixture.componentRef.setInput('actions', [parent]);
    fixture.componentRef.setInput('detachedItems', true);
    fixture.detectChanges();

    const outerItem = fixture.nativeElement.querySelector('[data-context-menu-item]') as HTMLLIElement;
    outerItem.click();
    fixture.detectChanges();

    const nestedHost = fixture.nativeElement.querySelector('context-menu') as HTMLElement;
    const nestedRoot = nestedHost.querySelector<HTMLElement>('[data-context-menu-root]')!;
    expect(nestedRoot.dataset['detachedItems']).toBe('true');
    expect(nestedRoot.classList.contains('bg-ui-menu')).toBe(false);
    expect(nestedRoot.querySelectorAll('[data-context-menu-item]')).toHaveLength(2);
    expect(nestedRoot.querySelectorAll('[data-context-menu-item-gap]')).toHaveLength(1);
  });

  it('draws at the original size unless the table asks for larger text', () => {
    component.contextMenuService.actions = [{ name: 'Action 1', action: vi.fn() }];
    fixture.detectChanges();

    expect(component.rootElementRef().nativeElement.style.getPropertyValue('--menu-font-scale')).toBe('1');
  });

  it('passes the table font scale to the items as a custom property', () => {
    component.contextMenuService.actions = [{ name: 'Action 1', action: vi.fn() }];
    component.contextMenuService.fontScale = 1.3;
    fixture.detectChanges();

    expect(component.rootElementRef().nativeElement.style.getPropertyValue('--menu-font-scale')).toBe('1.3');
  });
});
