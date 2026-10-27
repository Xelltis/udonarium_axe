import { TestBed } from '@angular/core/testing';
import { CoordinateService } from '@axe/application/input/coordinate.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopActionService } from '@axe/application/tabletop/tabletop-action.service';
import { type ImageDroppedEvent } from '@axe/core/event/domain-events';
import { EventChannel } from '@axe/core/event/event-channel';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import {
  ImageDropEventHandlerService,
  isTabletopDropTarget,
} from '@axe/features/tabletop/image-drop/image-drop-event-handler.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('isTabletopDropTarget', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('is true for an element inside the table layer', () => {
    document.body.innerHTML = '<div id="app-table-layer"><div id="piece"></div></div>';
    expect(isTabletopDropTarget(document.querySelector('#piece'))).toBe(true);
  });

  it('is true for the table layer itself', () => {
    document.body.innerHTML = '<div id="app-table-layer"></div>';
    expect(isTabletopDropTarget(document.querySelector('#app-table-layer'))).toBe(true);
  });

  it('is false outside it', () => {
    document.body.innerHTML = '<div id="panel"></div><div id="app-table-layer"></div>';
    expect(isTabletopDropTarget(document.querySelector('#panel'))).toBe(false);
  });

  it('is false for nothing at all', () => {
    expect(isTabletopDropTarget(null)).toBe(false);
  });
});

describe('ImageDropEventHandlerService', () => {
  let imageDropped$: EventChannel<ImageDroppedEvent>;
  let createGameCharacterWith: ReturnType<typeof vi.fn>;
  let canEditTabletop: boolean;
  let dropTarget: Element | null;
  let localCoordinate: { x: number; y: number; z: number };

  function setup(): void {
    TestBed.configureTestingModule({
      providers: [
        ...TEST_PROVIDERS,
        { provide: ObjectChangeService, useValue: { imageDropped$ } },
        { provide: TabletopActionService, useValue: { createGameCharacterWith } },
        { provide: CoordinateService, useValue: { calcTabletopLocalCoordinate: () => localCoordinate } },
        { provide: TableSelecter, useValue: { viewTable: { width: 20, height: 20, gridSize: 50 } } },
        {
          provide: RolePermissionService,
          useValue: {
            canEditTabletop() {
              return canEditTabletop;
            },
          },
        },
        ImageDropEventHandlerService,
      ],
    });
    TestBed.inject(ImageDropEventHandlerService);
  }

  function drop(fileName = 'ゴブリン.png'): void {
    imageDropped$.emit({ identifier: 'image-1', fileName, dropPoint: { x: 10, y: 20 } });
  }

  beforeEach(() => {
    imageDropped$ = new EventChannel<ImageDroppedEvent>();
    createGameCharacterWith = vi.fn();
    canEditTabletop = true;
    localCoordinate = { x: 100, y: 200, z: 0 };
    document.body.innerHTML = '<div id="app-table-layer"></div>';
    dropTarget = document.querySelector('#app-table-layer');
    vi.spyOn(document, 'elementFromPoint').mockImplementation(() => dropTarget);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('makes a character named after the file dropped on the board', () => {
    setup();
    drop();

    expect(createGameCharacterWith).toHaveBeenCalledWith({ x: 100, y: 200, z: 0 }, 'ゴブリン', 'image-1');
  });

  it('makes nothing from a drop outside the board', () => {
    document.body.innerHTML = '<div id="panel"></div>';
    dropTarget = document.querySelector('#panel');
    setup();
    drop();

    expect(createGameCharacterWith).not.toHaveBeenCalled();
  });

  it('makes nothing without permission to edit', () => {
    canEditTabletop = false;
    setup();
    drop();

    expect(createGameCharacterWith).not.toHaveBeenCalled();
  });

  it('pulls a drop past the edge back onto the table', () => {
    localCoordinate = { x: 4000, y: -300, z: 0 };
    setup();
    drop();

    expect(createGameCharacterWith).toHaveBeenCalledWith({ x: 975, y: 25, z: 0 }, expect.anything(), 'image-1');
  });

  it('makes nothing when it cannot tell where the drop landed', () => {
    dropTarget = null;
    setup();
    drop();

    expect(createGameCharacterWith).not.toHaveBeenCalled();
  });
});
