import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { FunctionalPaintService } from '@axe/application/tabletop/functional-paint.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { GridType } from '@axe/domain/tabletop/game-table';
import { MapEditorGesture } from '@axe/features/map-editor/editor/map-editor-gesture';
import {
  buildShapeKindPoints,
  MapEditorPanelComponent,
} from '@axe/features/map-editor/editor/map-editor-panel.component';
import { MapEditorState } from '@axe/features/map-editor/editor/map-editor-state';
import { pointToCell } from '@axe/features/map-editor/model/grid-cells';
import {
  cellKey,
  createScene,
  ImageLayer,
  ShapeLayer,
  StampLayer,
  TextLayer,
} from '@axe/features/map-editor/model/scene';
import { serializeScene } from '@axe/features/map-editor/model/serialize';
import { exportSceneToBlob } from '@axe/features/map-editor/render/export-image';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

/** The gesture is private; the tests borrow its name to reach it. */
function gestureOf(component: MapEditorPanelComponent): MapEditorGesture {
  return (component as unknown as { gesture: MapEditorGesture }).gesture;
}

describe('MapEditorPanelComponent', () => {
  let fixture: ComponentFixture<MapEditorPanelComponent>;
  let component: MapEditorPanelComponent;
  let imageStorage: { addAsync: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> };
  let table: { imageIdentifier: string; width: number; height: number; gridSize: number; gridType: GridType };
  let modalService: {
    option: unknown;
    title: string;
    resolve: ReturnType<typeof vi.fn>;
    open: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    imageStorage = { addAsync: vi.fn(), get: vi.fn() };
    table = { imageIdentifier: '', width: 0, height: 0, gridSize: 0, gridType: GridType.SQUARE };
    modalService = { option: undefined, title: '', resolve: vi.fn(), open: vi.fn().mockResolvedValue(null) };
    await TestBed.configureTestingModule({
      imports: [MapEditorPanelComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
    TestBed.overrideProvider(PanelService, { useValue: { title: '' } });
    TestBed.overrideProvider(ImageStorage, { useValue: imageStorage });
    TestBed.overrideProvider(TabletopService, { useValue: { currentTable: table } });
    TestBed.overrideProvider(ModalService, { useValue: modalService });
    fixture = TestBed.createComponent(MapEditorPanelComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    ImageStorage.instance.images.forEach((image) => ImageStorage.instance.delete(image.identifier));
    PeerCursor.myCursor = null!;
  });

  it('can be created', () => {
    expect(component).toBeTruthy();
  });

  it('shows only the game-master notice to anyone else', () => {
    TestBed.inject(ObjectChangeService);
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.role = PeerRole.Player;
    fixture.detectChanges();
    expect((component as unknown as { isGameMaster: () => boolean }).isGameMaster()).toBe(false);
    expect(fixture.nativeElement.querySelector('canvas')).toBeNull();
  });

  it('shows the canvas to the game master', () => {
    TestBed.inject(ObjectChangeService);
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.role = PeerRole.GameMaster;
    fixture.detectChanges();
    expect((component as unknown as { isGameMaster: () => boolean }).isGameMaster()).toBe(true);
    expect(fixture.nativeElement.querySelector('canvas')).not.toBeNull();
  });

  describe('dressing a wall in a picture that ships with the room', () => {
    interface Dresser {
      chooseFaceTexture: (face: 'wall', url: string) => void;
      state: MapEditorState;
    }

    function dresser(): Dresser {
      return component as unknown as Dresser;
    }

    it('wears the texture as an image the terrain can hold', () => {
      imageStorage.get.mockReturnValue(undefined);
      const add = vi.fn().mockReturnValue({ identifier: 'wall-asset' });
      (imageStorage as unknown as { add: unknown }).add = add;

      dresser().chooseFaceTexture('wall', 'assets/images/walls/wall_brick.webp');

      expect(add).toHaveBeenCalledWith('assets/images/walls/wall_brick.webp');
      expect(dresser().state.functionSpec().terrain.images.wall).toBe('wall-asset');
    });

    it('takes up a picture already kept rather than keeping it twice', () => {
      imageStorage.get.mockReturnValue({ identifier: 'already-kept' });
      const add = vi.fn();
      (imageStorage as unknown as { add: unknown }).add = add;

      dresser().chooseFaceTexture('wall', 'assets/images/walls/wall_brick.webp');

      expect(add).not.toHaveBeenCalled();
      expect(dresser().state.functionSpec().terrain.images.wall).toBe('already-kept');
    });
  });

  describe('being handed the brush as it opens', () => {
    interface Brushed {
      beginFunctionPaint: (role: 'moveBlock' | 'terrain' | 'mask') => void;
      state: MapEditorState;
      functionalPaint: FunctionalPaintService;
    }

    function brushed(): Brushed {
      return component as unknown as Brushed;
    }

    it('takes up the brush that was handed over', () => {
      brushed().beginFunctionPaint('terrain');

      expect(brushed().state.tool()).toBe('functionPaint');
      expect(brushed().state.functionRole()).toBe('terrain');
    });

    it('reads the table in over a scene with nothing drawn on it', () => {
      vi.spyOn(brushed().functionalPaint, 'snapshot').mockReturnValue({
        cols: 6,
        rows: 4,
        cellPx: 32,
        gridType: GridType.SQUARE,
        floorImageIdentifier: '',
        blockedCells: ['1,1'],
        terrainBlocks: [],
        maskBlocks: [],
      });

      brushed().beginFunctionPaint('moveBlock');

      expect(brushed().state.current.cols).toBe(6);
    });

    it('leaves a scene that has been worked on exactly as it stands', () => {
      brushed().state.functionRole.set('mask');
      brushed().state.paintFunctionCell(0, 0);
      const before = brushed().state.current.cols;
      vi.spyOn(brushed().functionalPaint, 'snapshot').mockReturnValue({
        cols: 6,
        rows: 4,
        cellPx: 32,
        gridType: GridType.SQUARE,
        floorImageIdentifier: '',
        blockedCells: [],
        terrainBlocks: [],
        maskBlocks: [],
      });

      brushed().beginFunctionPaint('moveBlock');

      expect(brushed().state.current.cols).toBe(before);
      expect(brushed().state.current.layers).toHaveLength(1);
    });
  });

  it('sets the exported image as the table background', async () => {
    const blob = new Blob([new Uint8Array([1])], { type: 'image/webp' });
    const exportStub = vi.fn().mockResolvedValue(blob);
    (component as unknown as { exportFn: typeof exportSceneToBlob }).exportFn = exportStub;
    imageStorage.addAsync.mockResolvedValue({ identifier: 'img-1' });

    await (component as unknown as { setAsTable: () => Promise<void> }).setAsTable();

    expect(exportStub).toHaveBeenCalledOnce();
    expect(imageStorage.addAsync).toHaveBeenCalledWith(blob);
    expect(table.imageIdentifier).toBe('img-1');
    expect(table.width).toBe(component['state'].current.cols);
    expect(table.height).toBe(component['state'].current.rows);
    expect(table.gridSize).toBe(component['state'].current.cellPx);
  });

  it('saves the exported image', async () => {
    const blob = new Blob([new Uint8Array([1])], { type: 'image/webp' });
    const exportStub = vi.fn().mockResolvedValue(blob);
    (component as unknown as { exportFn: typeof exportSceneToBlob }).exportFn = exportStub;
    imageStorage.addAsync.mockResolvedValue({ identifier: 'img-2' });

    await (component as unknown as { saveImage: () => Promise<void> }).saveImage();

    expect(imageStorage.addAsync).toHaveBeenCalledWith(blob);
  });

  it('starts with the select tool', () => {
    expect(component['state'].tool()).toBe('select');
  });

  it('starts a new scene on a transparent background', () => {
    expect(component['state'].current.background).toBe('transparent');
  });

  it('toggles the background between transparent and the last colour', () => {
    const c = component as unknown as {
      toggleBackgroundTransparent: (transparent: boolean) => void;
      backgroundTransparent: () => boolean;
      backgroundColorValue: () => string;
    };
    component['state'].setBackground('#445566');
    expect(c.backgroundTransparent()).toBe(false);

    c.toggleBackgroundTransparent(true);
    expect(component['state'].current.background).toBe('transparent');
    expect(c.backgroundTransparent()).toBe(true);
    expect(c.backgroundColorValue()).toBe('#445566');

    c.toggleBackgroundTransparent(false);
    expect(component['state'].current.background).toBe('#445566');
    expect(c.backgroundTransparent()).toBe(false);
  });

  it('writes the grid type onto the table', async () => {
    const blob = new Blob([new Uint8Array([1])], { type: 'image/webp' });
    (component as unknown as { exportFn: typeof exportSceneToBlob }).exportFn = vi.fn().mockResolvedValue(blob);
    imageStorage.addAsync.mockResolvedValue({ identifier: 'img-3' });
    component['state'].setGridType(GridType.HEX_VERTICAL);

    await (component as unknown as { setAsTable: () => Promise<void> }).setAsTable();

    expect(table.gridType).toBe(GridType.HEX_VERTICAL);
  });

  it('drags out a pentagon scaled to five vertices', () => {
    component['state'].shapeKind.set('pentagon');
    gestureOf(component).draftStart = { x: 0, y: 0 };
    (component as unknown as { draftCurrent: { x: number; y: number } }).draftCurrent = { x: 100, y: 80 };
    (component as unknown as { commitShape: (x: number, y: number, w: number, h: number) => void }).commitShape(
      0,
      0,
      100,
      80
    );
    const layer = component['state'].current.layers.find((l) => l.kind === 'shape') as ShapeLayer;
    expect(layer.items[0].shape).toBe('polygon');
    expect(layer.items[0].points.length).toBe(10);
  });

  it('makes a stroke-only polyline of three vertices on its own layer', () => {
    component['state'].tool.set('line');
    component['state'].lineKind.set('polyline');
    component['state'].strokeDash.set('dashed');
    gestureOf(component).draftPoints = [0, 0, 50, 0, 50, 50];
    (component as unknown as { commitDraftPolyline: () => void }).commitDraftPolyline();
    const shapeLayers = component['state'].current.layers.filter((l) => l.kind === 'shape') as ShapeLayer[];
    expect(shapeLayers.length).toBe(1);
    const item = shapeLayers[0].items[0];
    expect(item.shape).toBe('polyline');
    expect(item.fill).toBeNull();
    expect(item.stroke!.dash).toBe('dashed');
    expect(item.points).toEqual([0, 0, 50, 0, 50, 50]);
  });

  it('offers four kinds of line', () => {
    TestBed.inject(ObjectChangeService);
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.role = PeerRole.GameMaster;
    component['state'].tool.set('line');
    fixture.detectChanges();
    const t = (component as unknown as { t: (k: string) => string }).t;
    const expected = ['straight', 'polyline', 'curve', 'closedCurve'].map((k) =>
      t('feature.mapEditor.props.lineKinds.' + k)
    );
    const titles = Array.from(fixture.nativeElement.querySelectorAll('button[title]')).map((b) =>
      (b as HTMLElement).getAttribute('title')
    );
    const kindTitles = titles.filter((title) => expected.includes(title as string));
    expect(kindTitles.length).toBe(4);
  });

  it('makes a curve from clicked vertices and a press of enter', () => {
    component['state'].tool.set('line');
    component['state'].lineKind.set('curve');
    gestureOf(component).draftPoints = [0, 0, 50, 0, 50, 50];
    (component as unknown as { commitDraftPolyline: () => void }).commitDraftPolyline();
    const shapeLayers = component['state'].current.layers.filter((l) => l.kind === 'shape') as ShapeLayer[];
    const item = shapeLayers[0].items[0];
    expect(item.shape).toBe('curve');
    expect(item.fill).toBeNull();
    expect(item.points).toEqual([0, 0, 50, 0, 50, 50]);
  });

  it('makes a closed curve of three vertices with the current fill', () => {
    component['state'].tool.set('line');
    component['state'].lineKind.set('closedCurve');
    component['state'].fillMode.set('solid');
    component['state'].solidColor.set('#123456');
    gestureOf(component).draftPoints = [0, 0, 50, 0, 50, 50];
    (component as unknown as { commitDraftPolyline: () => void }).commitDraftPolyline();
    const shapeLayers = component['state'].current.layers.filter((l) => l.kind === 'shape') as ShapeLayer[];
    const item = shapeLayers[0].items[0];
    expect(item.shape).toBe('closedCurve');
    expect(item.fill).toEqual({ type: 'solid', color: '#123456' });
  });

  it('cancels the draft when the kind of line changes', () => {
    component['state'].tool.set('line');
    component['state'].lineKind.set('polyline');
    gestureOf(component).draftPoints = [0, 0, 50, 0];
    (component as unknown as { setLineKind: (k: string) => void }).setLineKind('straight');
    expect(gestureOf(component).draftPoints.length).toBe(0);
    expect(component['state'].lineKind()).toBe('straight');
  });

  it('resizes an image about its opposite corner and records one step of history', () => {
    component['state'].placeImage(
      { id: '', imageIdentifier: 'img', x: 100, y: 100, w: 80, h: 60, rotation: 0, opacity: 1 },
      '画像 1'
    );
    const layer = component['state'].current.layers.find((l) => l.kind === 'image') as ImageLayer;
    const id = layer.items[0].id;
    component['state'].selection.set({ layerId: layer.id, itemId: id });

    const c = component as unknown as { resizeImageTo: (x: number, y: number) => void };
    const gesture = gestureOf(component);
    component['state'].beginGesture();
    gesture.imageResize = { item: layer.items[0], anchorX: 60, anchorY: 70 };
    c.resizeImageTo(200, 170);
    c.resizeImageTo(260, 270);
    component['state'].endGesture();
    gesture.imageResize = null;

    expect(layer.items[0].w).toBe(200);
    expect(layer.items[0].h).toBe(200);
    expect(layer.items[0].x).toBe(160);
    expect(layer.items[0].y).toBe(170);

    component['state'].undo();
    const after = (component['state'].current.layers.find((l) => l.kind === 'image') as ImageLayer).items[0];
    expect(after.w).toBe(80);
    expect(after.h).toBe(60);
  });

  it('clamps a resize to eight pixels', () => {
    component['state'].placeImage(
      { id: '', imageIdentifier: 'img', x: 100, y: 100, w: 80, h: 60, rotation: 0, opacity: 1 },
      '画像 1'
    );
    const layer = component['state'].current.layers.find((l) => l.kind === 'image') as ImageLayer;
    component['state'].selection.set({ layerId: layer.id, itemId: layer.items[0].id });
    const c = component as unknown as { resizeImageTo: (x: number, y: number) => void };
    const gesture = gestureOf(component);
    gesture.imageResize = { item: layer.items[0], anchorX: 60, anchorY: 70 };
    c.resizeImageTo(62, 71);
    expect(layer.items[0].w).toBe(8);
    expect(layer.items[0].h).toBe(8);
  });

  it('always exports without the grid', async () => {
    const blob = new Blob([new Uint8Array([1])], { type: 'image/webp' });
    const exportStub = vi.fn().mockResolvedValue(blob);
    (component as unknown as { exportFn: typeof exportSceneToBlob }).exportFn = exportStub;
    imageStorage.addAsync.mockResolvedValue({ identifier: 'img-grid' });

    await (component as unknown as { saveImage: () => Promise<void> }).saveImage();

    expect(exportStub).toHaveBeenCalledOnce();
    expect(exportStub.mock.calls[0][2]).toMatchObject({ drawGrid: false });
  });

  it('places an image on its own layer and keeps it pending', async () => {
    imageStorage.get.mockReturnValue({ url: 'blob:test' });
    const image = { naturalWidth: 256, naturalHeight: 128, width: 256, height: 128 } as HTMLImageElement;
    (component as unknown as { loadImageFn: (url: string) => Promise<HTMLImageElement> }).loadImageFn = vi
      .fn()
      .mockResolvedValue(image);
    component['state'].pendingImageId.set('img-id');

    await (component as unknown as { placeImageAt: (x: number, y: number) => Promise<void> }).placeImageAt(200, 150);

    const layer = component['state'].current.layers.find((l) => l.kind === 'image') as ImageLayer;
    expect(layer.items.length).toBe(1);
    expect(layer.items[0].imageIdentifier).toBe('img-id');
    expect(layer.items[0].x).toBe(200);
    expect(layer.items[0].y).toBe(150);
    expect(component['state'].pendingImageId()).toBe('img-id');
  });

  it('paints the hex the point falls in', () => {
    component['state'].setGridType(GridType.HEX_VERTICAL);
    const scene = component['state'].current;
    const cell = pointToCell(scene.gridType, 130, 110, scene.cellPx);
    (component as unknown as { paintSampleAt: (x: number, y: number, tool: string) => void }).paintSampleAt(
      130,
      110,
      'cellPaint'
    );
    const layer = component['state'].current.layers.find((l) => l.kind === 'cell') as {
      cells: Record<string, unknown>;
    };
    expect(Object.keys(layer.cells)).toEqual([cellKey(cell.col, cell.row)]);
  });

  it('recolours the selected stamp', () => {
    component['state'].stampId.set('door-single');
    component['state'].stampColor.set(null);
    component['state'].placeStamp(100, 100, 'スタンプ 1');
    const layer = component['state'].current.layers.find((l) => l.kind === 'stamp') as StampLayer;
    const id = layer.items[0].id;
    component['state'].selection.set({ layerId: layer.id, itemId: id });

    component['state'].updateSelectedStamp({ color: '#ff0000' });

    expect(layer.items[0].color).toBe('#ff0000');
  });

  it('puts the stamp colour back to automatic', () => {
    component['state'].stampId.set('door-single');
    component['state'].stampColor.set('#ff0000');
    component['state'].placeStamp(100, 100, 'スタンプ 1');
    const layer = component['state'].current.layers.find((l) => l.kind === 'stamp') as StampLayer;
    const id = layer.items[0].id;
    component['state'].selection.set({ layerId: layer.id, itemId: id });

    component['state'].updateSelectedStamp({ color: null });

    expect(layer.items[0].color).toBeNull();
  });

  it('commits a line with the current pattern when the stroke is set to use one', () => {
    component['state'].strokeFillMode.set('texture');
    component['state'].textureId.set('image:stroke-tex');
    component['state'].addShapeItem('line', [0, 0, 40, 40], null);
    const layer = component['state'].current.layers.find((l) => l.kind === 'shape') as ShapeLayer;
    expect(layer.items[0].stroke?.fill).toEqual({
      type: 'texture',
      textureId: 'image:stroke-tex',
      scale: component['state'].textureScale(),
      rotation: component['state'].textureRotation(),
    });
  });

  it('commits a line with no pattern when the stroke is set to a colour', () => {
    component['state'].strokeFillMode.set('color');
    component['state'].addShapeItem('line', [0, 0, 40, 40], null);
    const layer = component['state'].current.layers.find((l) => l.kind === 'shape') as ShapeLayer;
    expect(layer.items[0].stroke?.fill).toBeNull();
  });

  it('starts editing new text on a press with the text tool', () => {
    component['state'].tool.set('text');
    const c = component as unknown as {
      onPointerDown: (e: PointerEvent) => void;
      editingText: () => { itemId: string | null } | null;
      board: () => { nativeElement: HTMLCanvasElement } | undefined;
    };
    (c as unknown as { board: () => { nativeElement: HTMLCanvasElement } }).board = () => ({
      nativeElement: { setPointerCapture: () => {}, getBoundingClientRect: () => ({ left: 0, top: 0 }) } as never,
    });
    c.onPointerDown({ button: 0, pointerId: 1, clientX: 64, clientY: 64 } as unknown as PointerEvent);
    expect(c.editingText()).not.toBeNull();
    expect(c.editingText()!.itemId).toBeNull();
  });

  it('adds a text item when there is text to add', () => {
    const c = component as unknown as {
      startTextEdit: (x: number, y: number, l: string | null, i: string | null, t: string) => void;
      commitTextEdit: () => void;
    };
    c.startTextEdit(40, 50, null, null, '');
    component['textDraft'].set('hello');
    c.commitTextEdit();
    const layer = component['state'].current.layers.find((l) => l.kind === 'text') as TextLayer;
    expect(layer.items.length).toBe(1);
    expect(layer.items[0].text).toBe('hello');
    expect(layer.items[0].x).toBe(40);
    expect(layer.items[0].y).toBe(50);
  });

  it('keeps the line breaks in multi-line text', () => {
    const c = component as unknown as {
      startTextEdit: (x: number, y: number, l: string | null, i: string | null, t: string) => void;
      commitTextEdit: () => void;
    };
    c.startTextEdit(0, 0, null, null, '');
    component['textDraft'].set('line1\nline2\nline3');
    c.commitTextEdit();
    const layer = component['state'].current.layers.find((l) => l.kind === 'text') as TextLayer;
    expect(layer.items[0].text).toBe('line1\nline2\nline3');
  });

  it('shows the inline editor while text is being edited', () => {
    TestBed.inject(ObjectChangeService);
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.role = PeerRole.GameMaster;
    component['state'].tool.set('text');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[contenteditable]')).toBeNull();
    (
      component as unknown as {
        startTextEdit: (x: number, y: number, l: string | null, i: string | null, t: string) => void;
      }
    ).startTextEdit(10, 20, null, null, '');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[contenteditable]')).not.toBeNull();
  });

  it('adds nothing for an empty draft', () => {
    const c = component as unknown as {
      startTextEdit: (x: number, y: number, l: string | null, i: string | null, t: string) => void;
      commitTextEdit: () => void;
    };
    c.startTextEdit(40, 50, null, null, '');
    component['textDraft'].set('   ');
    c.commitTextEdit();
    const layer = component['state'].current.layers.find((l) => l.kind === 'text');
    expect(layer).toBeUndefined();
  });

  it('updates the text of an existing item', () => {
    component['state'].addTextItem(10, 20, 'old');
    const layer = component['state'].current.layers.find((l) => l.kind === 'text') as TextLayer;
    const item = layer.items[0];
    const c = component as unknown as {
      startTextEdit: (x: number, y: number, l: string | null, i: string | null, t: string) => void;
      commitTextEdit: () => void;
    };
    c.startTextEdit(item.x, item.y, layer.id, item.id, item.text);
    component['textDraft'].set('new');
    c.commitTextEdit();
    const after = component['state'].current.layers.find((l) => l.kind === 'text') as TextLayer;
    expect(after.items[0].text).toBe('new');
  });

  it('deletes an existing item emptied by an edit', () => {
    component['state'].addTextItem(10, 20, 'old');
    const layer = component['state'].current.layers.find((l) => l.kind === 'text') as TextLayer;
    const item = layer.items[0];
    const c = component as unknown as {
      startTextEdit: (x: number, y: number, l: string | null, i: string | null, t: string) => void;
      commitTextEdit: () => void;
    };
    c.startTextEdit(item.x, item.y, layer.id, item.id, item.text);
    component['textDraft'].set('');
    c.commitTextEdit();
    const after = component['state'].current.layers.find((l) => l.kind === 'text') as TextLayer;
    expect(after.items.length).toBe(0);
  });

  it('throws the edit away on cancel', () => {
    component['state'].addTextItem(10, 20, 'keep');
    const layer = component['state'].current.layers.find((l) => l.kind === 'text') as TextLayer;
    const item = layer.items[0];
    const c = component as unknown as {
      startTextEdit: (x: number, y: number, l: string | null, i: string | null, t: string) => void;
      cancelTextEdit: () => void;
      editingText: () => unknown;
    };
    c.startTextEdit(item.x, item.y, layer.id, item.id, item.text);
    component['textDraft'].set('changed');
    c.cancelTextEdit();
    expect(c.editingText()).toBeNull();
    const after = component['state'].current.layers.find((l) => l.kind === 'text') as TextLayer;
    expect(after.items[0].text).toBe('keep');
  });

  it('reads an older json file', async () => {
    const json = serializeScene(createScene(7, 6, 48));
    const file = { arrayBuffer: () => Promise.resolve(new TextEncoder().encode(json).buffer) };
    const input = { files: [file], value: 'x' };
    const event = { target: input } as unknown as Event;

    await (component as unknown as { onFileSelected: (e: Event) => Promise<void> }).onFileSelected(event);

    expect(component['state'].current.cols).toBe(7);
    expect(component['state'].current.rows).toBe(6);
  });
});

describe('buildShapeKindPoints', () => {
  function vertexCount(pts: string): number {
    return pts.trim() === '' ? 0 : pts.trim().split(' ').length;
  }

  it('returns points for all seven kinds', () => {
    const kinds = ['rect', 'ellipse', 'triangle', 'pentagon', 'hexagon', 'star5', 'star6'] as const;
    for (const kind of kinds) {
      if (kind === 'rect' || kind === 'ellipse') {
        expect(buildShapeKindPoints(kind as never)).toBe('');
      } else {
        expect(buildShapeKindPoints(kind)).not.toBe('');
      }
    }
  });

  it('gives a triangle three vertices', () => {
    expect(vertexCount(buildShapeKindPoints('triangle'))).toBe(3);
  });

  it('gives a pentagon five', () => {
    expect(vertexCount(buildShapeKindPoints('pentagon'))).toBe(5);
  });

  it('gives a hexagon six', () => {
    expect(vertexCount(buildShapeKindPoints('hexagon'))).toBe(6);
  });

  it('gives a five-pointed star ten', () => {
    expect(vertexCount(buildShapeKindPoints('star5'))).toBe(10);
  });

  it('gives a six-pointed star twelve', () => {
    expect(vertexCount(buildShapeKindPoints('star6'))).toBe(12);
  });

  it('alternates the outer and inner radius of a five-pointed star about its centre', () => {
    const pts = buildShapeKindPoints('star5')
      .trim()
      .split(' ')
      .map((p) => p.split(',').map(Number));
    for (let i = 0; i < pts.length; i += 1) {
      const d = Math.hypot(pts[i][0] - 12, pts[i][1] - 12);
      if (i % 2 === 0) {
        expect(d).toBeCloseTo(9, 1);
      } else {
        expect(d).toBeCloseTo(9 * 0.382, 1);
      }
    }
  });
});
