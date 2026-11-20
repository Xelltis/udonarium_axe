import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ShortcutScopeService } from '@axe/application/ui/shortcut-scope.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Coin } from '@axe/domain/coin/coin';
import { MapScene, sceneHeightPx, sceneWidthPx, ShapeItem } from '@axe/domain/map-editor/scene';
import { deserializeScene, serializeScene } from '@axe/domain/map-editor/serialize';
import { LightSource } from '@axe/domain/tabletop/light-source';
import { WhiteBoard } from '@axe/domain/tabletop/white-board';
import { WhiteBoardEditorComponent } from '@axe/features/tabletop/white-board/white-board-editor.component';
import { SAVE_DELAY } from '@axe/features/tabletop/white-board/white-board-keeper';
import { WhiteBoardLayerDrawerComponent } from '@axe/features/tabletop/white-board/white-board-layer-drawer.component';
import { RULER_WIDTH } from '@axe/features/tabletop/white-board/white-board-rulers';
import {
  BOARD_TOOLS,
  BoardPoint,
  BoardTool,
  createBoardScene,
  freehandLayer,
  MarkStyle,
  penStroke,
  shapeBetween,
  shapeLayer,
  textLayer,
  wordsAt,
} from '@axe/features/tabletop/white-board/white-board-scene';
import { expectClosesForAGuest } from '@axe/testing/closes-for-a-guest';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

interface Call {
  method: string;
  args: unknown[];
}

const STYLE: MarkStyle = { color: '#123456', width: 3, fontSize: 24 };

function recordingContext(): { context: CanvasRenderingContext2D; calls: Call[]; count(method: string): number } {
  const calls: Call[] = [];
  const state: Record<string, unknown> = {
    globalAlpha: 1,
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    lineJoin: 'miter',
    lineCap: 'butt',
    font: '10px sans-serif',
    textAlign: 'left',
    textBaseline: 'alphabetic',
  };
  const context = new Proxy(
    {},
    {
      get(_, prop: string) {
        if (prop === 'measureText') return (text: string) => ({ width: text.length * 10 });
        if (prop === 'createPattern' || prop === 'createLinearGradient' || prop === 'createRadialGradient') {
          return () => ({ addColorStop: () => undefined });
        }
        if (prop === 'getLineDash') return () => [];
        if (prop in state) return state[prop];
        return (...args: unknown[]) => {
          calls.push({ method: prop, args });
        };
      },
      set(_, prop: string, value: unknown) {
        state[prop] = value;
        calls.push({ method: `set ${prop}`, args: [value] });
        return true;
      },
    }
  ) as CanvasRenderingContext2D;
  return { context, calls, count: (method) => calls.filter((call) => call.method === method).length };
}

/** An editor open on a board, driven the way a reader drives it: by its keys, its buttons and its sheet. */
interface Mounted {
  fixture: ComponentFixture<WhiteBoardEditorComponent>;
  editor: WhiteBoardEditorComponent;
  board: WhiteBoard;
  root: HTMLElement;
  canvas: HTMLCanvasElement;
}

describe('WhiteBoardEditorComponent', () => {
  /**
   * Opens the editor on a board twenty squares by fifteen, drawn on beforehand by `seed`.
   *
   * The sheet has no size on screen here, so a pointer's place on the page is its place on the board.
   */
  function mount(seed: (scene: MapScene) => void = () => undefined): Mounted {
    TestBed.configureTestingModule({ imports: [WhiteBoardEditorComponent], providers: [...TEST_PROVIDERS] });
    const fixture = TestBed.createComponent(WhiteBoardEditorComponent);
    const board = WhiteBoard.create('ホワイトボード', 20, 15, 1);
    const scene = createBoardScene(20, 15, 50);
    seed(scene);
    board.scene = serializeScene(scene);
    fixture.componentInstance.bindToBoard(board);
    fixture.detectChanges();
    const root = (fixture.nativeElement as HTMLElement).firstElementChild as HTMLElement;
    return { fixture, editor: fixture.componentInstance, board, root, canvas: root.querySelector('canvas')! };
  }

  /** The drawing as the board is handed it once the editor has been left alone for a moment. */
  function drawing(board: WhiteBoard): MapScene {
    vi.advanceTimersByTime(SAVE_DELAY);
    return deserializeScene(board.scene)!;
  }

  function shapes(board: WhiteBoard): ShapeItem[] {
    return shapeLayer(drawing(board)).items;
  }

  function press(
    root: HTMLElement,
    init: KeyboardEventInit & { key: string },
    from: HTMLElement = root
  ): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { cancelable: true, bubbles: true, ...init });
    from.dispatchEvent(event);
    return event;
  }

  function pointer(canvas: HTMLElement, type: string, at: BoardPoint, init: PointerEventInit = {}): void {
    canvas.dispatchEvent(
      new PointerEvent(type, {
        clientX: at.x,
        clientY: at.y,
        button: 0,
        buttons: 1,
        pointerId: 1,
        bubbles: true,
        ...init,
      })
    );
  }

  function drag(canvas: HTMLElement, from: BoardPoint, through: BoardPoint[], to: BoardPoint): void {
    pointer(canvas, 'pointerdown', from);
    for (const at of through) pointer(canvas, 'pointermove', at);
    pointer(canvas, 'pointerup', to, { buttons: 0 });
  }

  function click(canvas: HTMLElement, at: BoardPoint): void {
    drag(canvas, at, [], at);
  }

  function toolButton(root: HTMLElement, tool: BoardTool): HTMLButtonElement {
    return root.firstElementChild!.querySelectorAll('button')[BOARD_TOOLS.indexOf(tool)];
  }

  function iconButton(root: HTMLElement, icon: string): HTMLButtonElement {
    const found = [...root.querySelectorAll('button')].find((button) => button.textContent?.trim() === icon);
    if (!found) throw new Error(`no button drawn with ${icon}`);
    return found;
  }

  function stage(canvas: HTMLElement): HTMLElement {
    return canvas.closest('.overflow-auto') as HTMLElement;
  }

  /** How big the sheet is shown, read off the room laid out for a board a thousand pixels wide. */
  function zoomShown(made: Mounted): number {
    made.fixture.detectChanges();
    const sized = stage(made.canvas).firstElementChild as HTMLElement;
    return (parseFloat(sized.style.width) - RULER_WIDTH) / 1000;
  }

  function chooseZoom(made: Mounted, label: string): void {
    made.fixture.detectChanges();
    const select = made.root.querySelector('select[name="board-zoom"]') as HTMLSelectElement;
    select.selectedIndex = [...select.options].findIndex((option) => option.textContent?.trim() === label);
    select.dispatchEvent(new Event('change'));
    made.fixture.detectChanges();
  }

  function rect(scene: MapScene, from: BoardPoint, to: BoardPoint): ShapeItem {
    const item = shapeBetween('rect', from, to, STYLE);
    shapeLayer(scene).items.push(item);
    return item;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(null));
  });

  afterEach(() => {
    ObjectStore.instance.getObjects().forEach((object) => ObjectStore.instance.delete(object, false));
    ObjectStore.instance.clearDeleteHistory();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('closes once its seat is made a guest, who may no longer write what it writes', () => {
    expectClosesForAGuest(() => mount());
  });

  it('puts its keys first on the cheat sheet while it is open', () => {
    const { fixture } = mount();
    const scopes = TestBed.inject(ShortcutScopeService);
    expect(scopes.scopes()).toContain('whiteBoard');
    fixture.destroy();
    expect(scopes.scopes()).not.toContain('whiteBoard');
  });

  it('undoes back to the board as it was opened, not to a blank sheet', () => {
    const { board, root, canvas } = mount();
    drag(canvas, { x: 0, y: 0 }, [{ x: 10, y: 10 }], { x: 20, y: 20 });
    expect(drawing(board).layers).toHaveLength(1);

    iconButton(root, 'undo').click();

    const back = drawing(board);
    expect(sceneWidthPx(back)).toBe(1000);
    expect(sceneHeightPx(back)).toBe(750);
    expect(back.layers).toHaveLength(0);
  });

  it('hands the layer drawer the same sheets until the drawing changes, so it is not drawn again for nothing', () => {
    const { fixture, root, canvas } = mount((scene) => rect(scene, { x: 10, y: 10 }, { x: 60, y: 40 }));
    const drawer = fixture.debugElement.query(By.directive(WhiteBoardLayerDrawerComponent))
      .componentInstance as WhiteBoardLayerDrawerComponent;
    const before = drawer.groups();
    expect(before).toHaveLength(1);

    press(root, { key: 'v' });
    fixture.detectChanges();
    expect(drawer.groups()).toBe(before);
    press(root, { key: 'p' });

    drag(canvas, { x: 100, y: 100 }, [{ x: 110, y: 110 }], { x: 120, y: 120 });
    fixture.detectChanges();
    expect(drawer.groups()).not.toBe(before);
    expect(drawer.groups()).toHaveLength(2);
    expect(drawer.layerCount()).toBe(2);
  });

  it('lists a coin and a light set on the board for the layer drawer to take off, back where they appeared to be', () => {
    const { fixture, board } = mount();
    board.location = { name: 'table', x: 100, y: 200 };
    const coin = Coin.create('coin');
    coin.location = { name: 'table', x: 10, y: 20, surface: board.identifier };
    const light = LightSource.create('light');
    light.location = { name: 'table', x: 30, y: 40, surface: board.identifier };
    fixture.detectChanges();
    const drawer = fixture.debugElement.query(By.directive(WhiteBoardLayerDrawerComponent))
      .componentInstance as WhiteBoardLayerDrawerComponent;
    const listed = () => drawer.standing().map((object) => object.identifier);
    expect(listed()).toEqual(expect.arrayContaining([coin.identifier, light.identifier]));

    drawer.action.emit({ kind: 'takeOff', object: coin });
    fixture.detectChanges();

    expect([coin.location.surface, coin.location.x, coin.location.y]).toEqual([undefined, 110, 220]);
    expect(listed()).toEqual([light.identifier]);
  });

  describe('keyboard', () => {
    it.each<[string, BoardTool]>([
      ['v', 'select'],
      ['p', 'pen'],
      ['m', 'marker'],
      ['e', 'eraser'],
      ['l', 'line'],
      ['a', 'arrow'],
      ['r', 'shape'],
      ['t', 'text'],
      ['n', 'note'],
    ])('picks the %s tool on %s', (pressed, tool) => {
      const { editor, root } = mount();
      if (pressed === 'p') press(root, { key: 'v' });

      const event = press(root, { key: pressed });

      expect(editor.tool()).toBe(tool);
      expect(event.defaultPrevented).toBe(true);
    });

    it('leaves the keys alone while something is being typed', () => {
      const { editor, root } = mount();
      const name = root.querySelector('input[name="board-name"]') as HTMLInputElement;

      press(root, { key: 'v' }, name);

      expect(editor.tool()).toBe('pen');
    });

    it('lets go of what was held on undo, since the mark may no longer be there', () => {
      const { editor, root, canvas } = mount();
      press(root, { key: 'r' });
      drag(canvas, { x: 10, y: 10 }, [{ x: 40, y: 40 }], { x: 60, y: 60 });
      expect(editor.selected()?.kind).toBe('shape');

      press(root, { key: 'z', ctrlKey: true });

      expect(editor.held()).toEqual([]);
      expect(editor.selected()).toBeNull();
    });

    it('undoes on ctrl+z and redoes on ctrl+y or ctrl+shift+z', () => {
      const { board, root, canvas } = mount();
      drag(canvas, { x: 0, y: 0 }, [{ x: 10, y: 10 }], { x: 20, y: 20 });

      press(root, { key: 'z', ctrlKey: true });
      expect(drawing(board).layers).toHaveLength(0);

      press(root, { key: 'y', ctrlKey: true });
      expect(drawing(board).layers).toHaveLength(1);

      press(root, { key: 'z', ctrlKey: true });
      press(root, { key: 'z', ctrlKey: true, shiftKey: true });
      expect(drawing(board).layers).toHaveLength(1);
    });

    it('removes what is held on delete', () => {
      const { editor, board, root, canvas } = mount((scene) => rect(scene, { x: 10, y: 10 }, { x: 60, y: 40 }));
      press(root, { key: 'v' });
      click(canvas, { x: 30, y: 20 });
      expect(editor.held()).toHaveLength(1);

      press(root, { key: 'Delete' });

      expect(shapes(board)).toHaveLength(0);
      expect(editor.held()).toHaveLength(0);
    });

    it('holds every mark on ctrl+a', () => {
      const { editor, root } = mount((scene) => {
        rect(scene, { x: 10, y: 10 }, { x: 60, y: 40 });
        rect(scene, { x: 100, y: 100 }, { x: 160, y: 140 });
        textLayer(scene).items.push(wordsAt({ x: 200, y: 200 }, 'hello', STYLE));
      });

      press(root, { key: 'a', ctrlKey: true });

      expect(editor.held()).toHaveLength(3);
    });

    it('duplicates what is held on ctrl+d and takes hold of the copy', () => {
      let made!: ShapeItem;
      const { editor, board, root } = mount((scene) => (made = rect(scene, { x: 10, y: 10 }, { x: 60, y: 40 })));
      press(root, { key: 'a', ctrlKey: true });

      press(root, { key: 'd', ctrlKey: true });

      expect(shapes(board)).toHaveLength(2);
      expect(editor.held()[0].id).not.toBe(made.id);
      expect(shapes(board)[1].points.slice(0, 2)).toEqual([26, 26]);
    });

    it('copies on ctrl+c and pastes on ctrl+v', () => {
      const { board, root } = mount((scene) => rect(scene, { x: 10, y: 10 }, { x: 60, y: 40 }));
      press(root, { key: 'a', ctrlKey: true });

      press(root, { key: 'c', ctrlKey: true });
      press(root, { key: 'v', ctrlKey: true });
      press(root, { key: 'v', ctrlKey: true });

      expect(shapes(board)).toHaveLength(3);
    });

    it('brings forward on ctrl+] and sends back on ctrl+[', () => {
      let under!: ShapeItem;
      let over!: ShapeItem;
      const { editor, board, root, canvas } = mount((scene) => {
        under = rect(scene, { x: 10, y: 10 }, { x: 60, y: 40 });
        over = rect(scene, { x: 200, y: 200 }, { x: 270, y: 250 });
      });
      press(root, { key: 'v' });
      click(canvas, { x: 30, y: 20 });
      expect(editor.held()).toEqual([{ kind: 'shape', id: under.id }]);

      press(root, { key: ']', ctrlKey: true });
      expect(shapes(board).map((item) => item.id)).toEqual([over.id, under.id]);

      press(root, { key: '[', ctrlKey: true });
      expect(shapes(board).map((item) => item.id)).toEqual([under.id, over.id]);
    });

    it('sets a path down on enter and throws it away on escape', () => {
      const { editor, board, root, canvas } = mount();
      toolButton(root, 'path').click();
      click(canvas, { x: 0, y: 0 });
      click(canvas, { x: 50, y: 20 });
      click(canvas, { x: 80, y: 90 });
      expect(editor.laying()).toHaveLength(3);

      press(root, { key: 'Escape' });
      expect(editor.laying()).toHaveLength(0);
      expect(shapes(board)).toHaveLength(0);

      click(canvas, { x: 0, y: 0 });
      click(canvas, { x: 50, y: 20 });
      press(root, { key: 'Enter' });
      expect(shapes(board)).toHaveLength(1);
      expect(editor.tool()).toBe('select');
      expect(editor.held()).toHaveLength(1);
    });

    it('pans only while the space bar is held', () => {
      const { fixture, root, canvas } = mount();

      press(root, { key: ' ' });
      fixture.detectChanges();
      expect(stage(canvas).classList).toContain('cursor-grab');

      root.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }));
      fixture.detectChanges();
      expect(stage(canvas).classList).not.toContain('cursor-grab');
    });

    it('zooms with ctrl and plus, minus and zero', () => {
      const made = mount();

      press(made.root, { key: '=', ctrlKey: true });
      expect(zoomShown(made)).toBeCloseTo(1.15);

      press(made.root, { key: '-', ctrlKey: true });
      expect(zoomShown(made)).toBeCloseTo(1);

      chooseZoom(made, '200%');
      expect(zoomShown(made)).toBe(2);
      press(made.root, { key: '0', ctrlKey: true });
      expect(zoomShown(made)).toBe(1);
    });
  });

  describe('rulers', () => {
    function ticks(made: Mounted, axis: 'x' | 'y'): { at: number; px: number }[] {
      made.fixture.detectChanges();
      const ruler = made.root.querySelector(axis === 'x' ? '.cursor-ew-resize' : '.cursor-ns-resize')!;
      return [...ruler.querySelectorAll('span')].map((mark) => ({
        at: Number(mark.textContent),
        px: parseFloat(axis === 'x' ? mark.style.left : mark.style.top) - 1,
      }));
    }

    it('writes a number every fifty pixels at full size', () => {
      const marks = ticks(mount(), 'x');

      expect(marks).toHaveLength(21);
      expect(marks[1]).toEqual({ at: 50, px: 50 });
      expect(marks.at(-1)).toEqual({ at: 1000, px: 1000 });
    });

    it('spaces the numbers out when the sheet is shrunk', () => {
      const made = mount();
      chooseZoom(made, '50%');

      const marks = ticks(made, 'y');

      expect(marks.map((mark) => mark.at)).toEqual([0, 100, 200, 300, 400, 500, 600, 700]);
      expect(marks[1].px).toBe(50);
    });

    it('keeps the fifty pixel step when the sheet is enlarged', () => {
      const made = mount();
      chooseZoom(made, '200%');

      const marks = ticks(made, 'x');

      expect(marks).toHaveLength(21);
      expect(marks[1]).toEqual({ at: 50, px: 100 });
    });
  });

  describe('pointer gestures', () => {
    it('lays a pen stroke through the points the pointer passed', () => {
      const { board, canvas } = mount();

      drag(
        canvas,
        { x: 10, y: 10 },
        [
          { x: 40, y: 20 },
          { x: 80, y: 60 },
        ],
        { x: 120, y: 60 }
      );

      const strokes = freehandLayer(drawing(board)).strokes;
      expect(strokes).toHaveLength(1);
      expect(strokes[0].points.slice(0, 2)).toEqual([10, 10]);
      expect(strokes[0].points.slice(-2)).toEqual([80, 60]);
      expect(strokes[0].width).toBe(4);
    });

    it('draws a line from where the drag began to where it ended, and takes hold of it', () => {
      const { editor, board, root, canvas } = mount();
      press(root, { key: 'l' });

      drag(
        canvas,
        { x: 100, y: 100 },
        [
          { x: 150, y: 120 },
          { x: 300, y: 140 },
        ],
        { x: 300, y: 140 }
      );

      const drawn = shapes(board);
      expect(drawn).toHaveLength(1);
      expect(drawn[0].shape).toBe('line');
      expect(drawn[0].points).toEqual([100, 100, 300, 140]);
      expect(editor.held()).toEqual([{ kind: 'shape', id: drawn[0].id }]);
    });

    it('draws nothing from a drag too short to have meant anything', () => {
      const { board, root, canvas } = mount();
      press(root, { key: 'r' });

      drag(canvas, { x: 100, y: 100 }, [], { x: 102, y: 101 });

      expect(shapes(board)).toHaveLength(0);
    });

    it('takes hold of the mark under the pointer and carries it with the drag', () => {
      let made!: ShapeItem;
      const { editor, board, root, canvas } = mount(
        (scene) => (made = rect(scene, { x: 100, y: 100 }, { x: 200, y: 160 }))
      );
      press(root, { key: 'v' });

      drag(canvas, { x: 150, y: 130 }, [{ x: 170, y: 140 }], { x: 190, y: 150 });

      expect(editor.held()).toEqual([{ kind: 'shape', id: made.id }]);
      expect(shapes(board)[0].points.slice(0, 2)).toEqual([120, 110]);
    });

    it('drags a band over empty sheet and takes hold of everything inside it', () => {
      let inside!: ShapeItem;
      const { editor, root, canvas } = mount((scene) => {
        inside = rect(scene, { x: 100, y: 100 }, { x: 140, y: 140 });
        rect(scene, { x: 600, y: 600 }, { x: 640, y: 640 });
      });
      press(root, { key: 'v' });

      drag(canvas, { x: 50, y: 50 }, [{ x: 200, y: 200 }], { x: 300, y: 300 });

      expect(editor.held()).toEqual([{ kind: 'shape', id: inside.id }]);
    });

    it('slides the sheet on the middle button instead of marking it', () => {
      const { fixture, board, canvas } = mount();

      pointer(canvas, 'pointerdown', { x: 10, y: 10 }, { button: 1, buttons: 4 });
      fixture.detectChanges();
      expect(stage(canvas).classList).toContain('cursor-grabbing');
      pointer(canvas, 'pointermove', { x: 30, y: 30 }, { buttons: 4 });
      pointer(canvas, 'pointerup', { x: 30, y: 30 }, { button: 1, buttons: 0 });
      fixture.detectChanges();

      expect(stage(canvas).classList).not.toContain('cursor-grabbing');
      expect(freehandLayer(drawing(board)).strokes).toHaveLength(0);
    });

    it('rubs out the words under the eraser', () => {
      const { board, root, canvas } = mount((scene) =>
        textLayer(scene).items.push(wordsAt({ x: 200, y: 200 }, 'hello', STYLE))
      );
      press(root, { key: 'e' });

      click(canvas, { x: 210, y: 210 });

      expect(textLayer(drawing(board)).items).toHaveLength(0);
    });
  });

  describe('saving', () => {
    it('writes the drawing down a breath after the last change', () => {
      const { board, canvas } = mount();
      const before = board.scene;
      drag(canvas, { x: 0, y: 0 }, [{ x: 10, y: 10 }], { x: 20, y: 20 });

      vi.advanceTimersByTime(SAVE_DELAY - 1);
      expect(board.scene).toBe(before);

      vi.advanceTimersByTime(1);
      expect(board.scene).not.toBe(before);
      expect(board.scene).toContain('freehand');
    });

    it('writes it down at once when the editor is closed within that breath', () => {
      const { fixture, board, canvas } = mount();
      const before = board.scene;
      drag(canvas, { x: 0, y: 0 }, [{ x: 10, y: 10 }], { x: 20, y: 20 });

      fixture.destroy();

      expect(board.scene).not.toBe(before);
      expect(board.scene).toContain('freehand');
      const written = board.scene;
      vi.runAllTimers();
      expect(board.scene).toBe(written);
    });
  });

  describe('redraw', () => {
    it('paints the marks, the ruling and the hold onto a sheet of the board size', async () => {
      vi.useRealTimers();
      const recorder = recordingContext();
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
        () => recorder.context as unknown as RenderingContext
      );
      const { fixture, root, canvas } = mount((scene) => {
        freehandLayer(scene).strokes.push(penStroke([0, 0, 10, 10, 20, 5], STYLE));
        rect(scene, { x: 100, y: 100 }, { x: 160, y: 140 });
        textLayer(scene).items.push(wordsAt({ x: 200, y: 200 }, 'hello', STYLE));
      });
      press(root, { key: 'v' });
      click(canvas, { x: 130, y: 120 });
      await fixture.whenStable();
      recorder.calls.length = 0;

      press(root, { key: ']', ctrlKey: true });
      await fixture.whenStable();

      expect(canvas.width).toBe(1000);
      expect(canvas.height).toBe(750);
      expect(recorder.calls.filter((call) => call.method === 'fillText').map((call) => call.args[0])).toEqual([
        'hello',
      ]);
      expect(recorder.calls.some((call) => call.method === 'set strokeStyle' && call.args[0] === '#123456')).toBe(true);
      expect(recorder.calls.some((call) => call.method === 'setLineDash' && String(call.args[0]) === '4,3')).toBe(true);
      expect(recorder.calls.some((call) => call.method === 'strokeRect' && String(call.args) === '100,100,60,40')).toBe(
        true
      );
      expect(recorder.count('rect')).toBe(1);
      expect(recorder.count('lineTo')).toBe(4);
    });
  });
});
