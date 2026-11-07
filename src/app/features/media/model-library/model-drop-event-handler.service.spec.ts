import { TestBed } from '@angular/core/testing';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { TablePickService } from '@axe/application/tabletop/table-pick.service';
import { TabletopActionService } from '@axe/application/tabletop/tabletop-action.service';
import { SnackbarService } from '@axe/application/ui/snackbar.service';
import { ModelStorage } from '@axe/core/storage/model-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { MODEL_DRAG_TYPE } from '@axe/features/media/model-library/attach-model';
import { ModelDropEventHandlerService } from '@axe/features/media/model-library/model-drop-event-handler.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('ModelDropEventHandlerService', () => {
  const modelId = 'a'.repeat(64);
  let canEditTabletop: boolean;
  let pressed: { target: { id: string } } | null;
  let made: GameCharacter[];

  /** Lets a model dragged from the list of models go at a point of the page. */
  function drop(identifier = modelId): DragEvent {
    const event = new Event('drop', { bubbles: true, cancelable: true }) as DragEvent;
    Object.defineProperty(event, 'clientX', { value: 10 });
    Object.defineProperty(event, 'clientY', { value: 20 });
    Object.defineProperty(event, 'dataTransfer', {
      value: { types: [MODEL_DRAG_TYPE], getData: (type: string) => (type === MODEL_DRAG_TYPE ? identifier : '') },
    });
    document.dispatchEvent(event);
    return event;
  }

  beforeEach(() => {
    canEditTabletop = true;
    pressed = null;
    made = [];
    document.body.innerHTML = '<div id="app-table-layer"></div>';
    vi.spyOn(document, 'elementFromPoint').mockImplementation(() => document.querySelector('#app-table-layer'));
    TestBed.configureTestingModule({
      providers: [
        ...TEST_PROVIDERS,
        { provide: SnackbarService, useValue: { show: () => {} } },
        {
          provide: TablePickService,
          useValue: { pressedAt: () => pressed, landingAt: () => ({ x: 100, y: 200, z: 0 }) },
        },
        {
          provide: TabletopActionService,
          useValue: {
            createGameCharacterWith: (_at: unknown, name: string) => {
              const piece = GameCharacter.create(name, 1, '');
              made.push(piece);
              return piece;
            },
          },
        },
        { provide: RolePermissionService, useValue: { canEditTabletop: () => canEditTabletop } },
      ],
    });
    TestBed.inject(ModelStorage).add({
      identifier: modelId,
      name: 'statue.glb',
      type: 'model/gltf-binary',
      blob: new Blob([new Uint8Array([1])]),
      url: '',
    });
    TestBed.inject(ModelDropEventHandlerService);
  });

  afterEach(() => {
    TestBed.inject(ModelStorage).delete(modelId);
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    for (const object of ObjectStore.instance.getObjects(GameCharacter)) ObjectStore.instance.remove(object);
    document.body.innerHTML = '';
  });

  it('draws the piece a model is let go on as the model', () => {
    const piece = GameCharacter.create('騎士', 1, '');
    pressed = { target: { id: piece.identifier } };

    expect(drop().defaultPrevented).toBe(true);

    expect(piece.modelIdentifier).toBe(modelId);
    expect(made).toEqual([]);
  });

  it('makes a piece drawn as the model, named after it, where it lands on nothing', () => {
    drop();

    expect(made.map((piece) => [piece.name, piece.modelIdentifier])).toEqual([['statue', modelId]]);
  });

  it('puts nothing anywhere for a seat that may not change the table, or for a model not held here', () => {
    canEditTabletop = false;
    drop();
    canEditTabletop = true;
    drop('b'.repeat(64));

    expect(made).toEqual([]);
  });
});
