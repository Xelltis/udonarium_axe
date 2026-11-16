import type { TabletopOverlapRegistryEntry } from '@axe/application/ui/tabletop-overlap.service';
import type { TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import { handCanvasPressesOn } from '@axe/features/tabletop/game-table/canvas-presses';

describe('handing presses on the canvas to the blocks drawn there', () => {
  let root: HTMLElement;
  let block: HTMLElement;
  let piece: HTMLElement;
  let picked: string | null;
  let entries: Record<string, TabletopOverlapRegistryEntry>;
  let aimed: boolean;
  let remove: () => void;

  beforeEach(() => {
    root = document.createElement('div');
    block = document.createElement('div');
    piece = document.createElement('div');
    piece.setAttribute('data-object-id', 'a-piece');
    root.append(block, piece);
    document.body.appendChild(root);
    picked = 'a-block';
    aimed = false;
    entries = { 'a-block': { object: {} as TabletopObject, element: block } };
    remove = handCanvasPressesOn(root, {
      pickAt: () => picked,
      entryOf: (identifier) => entries[identifier],
      aimedAtTarget: () => aimed,
    });
  });

  afterEach(() => {
    remove();
    root.remove();
  });

  /** Where a press dispatched on an element reached, the block and the table's root, in turn. */
  function pressOn(element: Element, type = 'mousedown'): { reached: string[] } {
    const reached: string[] = [];
    const note = (where: string) => (event: Event) => reached.push(`${where}:${event.type}`);
    const onBlock = note('block');
    const onRoot = note('root');
    block.addEventListener(type, onBlock);
    root.addEventListener(type, onRoot);
    element.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: 30, clientY: 40 }));
    block.removeEventListener(type, onBlock);
    root.removeEventListener(type, onRoot);
    return { reached };
  }

  it('listens for the presses as ones it may cancel, saying so', () => {
    const other = document.createElement('div');
    const added = vi.spyOn(other, 'addEventListener');

    const stop = handCanvasPressesOn(other, { pickAt: () => null, entryOf: () => undefined });

    expect(added).toHaveBeenCalledWith('touchstart', expect.any(Function), { capture: true, passive: false });
    stop();
  });

  it('picks the mouse press the browser sends after the pointer goes down at the point the pointer went down at', () => {
    const at: { x: number; y: number }[] = [];
    remove();
    remove = handCanvasPressesOn(root, {
      pickAt: (x, y) => {
        at.push({ x, y });
        return x > 30 ? 'a-block' : null;
      },
      entryOf: (identifier) => entries[identifier],
      aimedAtTarget: () => aimed,
    });

    const placedAt = (event: MouseEvent, x: number, y: number) =>
      Object.defineProperties(event, { pageX: { value: x }, pageY: { value: y } });
    root.dispatchEvent(placedAt(new PointerEvent('pointerdown', { bubbles: true }), 30.4, 40.6));
    root.dispatchEvent(placedAt(new MouseEvent('mousedown', { bubbles: true }), 30, 40));

    expect(at[1]).toEqual(at[0]);
    expect(at[0].x).toBeCloseTo(30.4, 6);
  });

  describe('a right click, which the browser places at whole pixels', () => {
    let at: { x: number; y: number }[];
    const placedAt = (event: MouseEvent, x: number, y: number) =>
      Object.defineProperties(event, { pageX: { value: x }, pageY: { value: y } });

    /** Picks a block right of 30.2 and its neighbour left of it, and notes where each press was picked. */
    beforeEach(() => {
      at = [];
      const neighbour = document.createElement('div');
      root.append(neighbour);
      entries['a-neighbour'] = { object: {} as TabletopObject, element: neighbour };
      remove();
      remove = handCanvasPressesOn(root, {
        pickAt: (x, y) => {
          at.push({ x, y });
          return x > 30.2 ? 'a-block' : 'a-neighbour';
        },
        entryOf: (identifier) => entries[identifier],
        aimedAtTarget: () => aimed,
      });
    });

    function menuReaches(): string[] {
      const reached: string[] = [];
      block.addEventListener('contextmenu', () => reached.push('block'));
      entries['a-neighbour'].element!.addEventListener('contextmenu', () => reached.push('neighbour'));
      return reached;
    }

    it('is handed to what its press was picked on, at the point the pointer went down at', () => {
      const reached = menuReaches();

      root.dispatchEvent(placedAt(new PointerEvent('pointerdown', { bubbles: true, button: 2 }), 30.4, 40.6));
      root.dispatchEvent(placedAt(new MouseEvent('mousedown', { bubbles: true, button: 2 }), 30, 40));
      root.dispatchEvent(placedAt(new MouseEvent('contextmenu', { bubbles: true, button: 2 }), 30, 40));

      expect(at[2]).toEqual(at[0]);
      expect(reached).toEqual(['block']);
    });

    it('is picked at its own point once the pointer has moved off where it went down', () => {
      const reached = menuReaches();

      root.dispatchEvent(placedAt(new PointerEvent('pointerdown', { bubbles: true, button: 2 }), 30.4, 40.6));
      root.dispatchEvent(placedAt(new MouseEvent('contextmenu', { bubbles: true, button: 2 }), 12, 40));

      expect(at[1]).toEqual({ x: 12, y: 40 });
      expect(reached).toEqual(['neighbour']);
    });

    it('is picked at its own point where no press came before it, as the menu key sends it', () => {
      const reached = menuReaches();

      root.dispatchEvent(placedAt(new MouseEvent('contextmenu', { bubbles: true }), 31, 40));

      expect(at).toEqual([{ x: 31, y: 40 }]);
      expect(reached).toEqual(['block']);
    });

    it('that ends a long press of a finger is picked where the finger went down', () => {
      const reached = menuReaches();

      root.dispatchEvent(
        placedAt(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }), 30.4, 40.6)
      );
      root.dispatchEvent(placedAt(new MouseEvent('contextmenu', { bubbles: true }), 30, 41));

      expect(at[1]).toEqual(at[0]);
      expect(reached).toEqual(['block']);
    });
  });

  describe('a click and a double click, which the browser places at whole pixels', () => {
    let at: { x: number; y: number }[];
    const placedAt = (event: MouseEvent, x: number, y: number) =>
      Object.defineProperties(event, { pageX: { value: x }, pageY: { value: y } });

    /** Picks a block right of 30.2 and its neighbour left of it, and notes where each press was picked. */
    beforeEach(() => {
      at = [];
      const neighbour = document.createElement('div');
      root.append(neighbour);
      entries['a-neighbour'] = { object: {} as TabletopObject, element: neighbour };
      remove();
      remove = handCanvasPressesOn(root, {
        pickAt: (x, y) => {
          at.push({ x, y });
          return x > 30.2 ? 'a-block' : 'a-neighbour';
        },
        entryOf: (identifier) => entries[identifier],
        aimedAtTarget: () => aimed,
      });
    });

    function reaches(type: string): string[] {
      const reached: string[] = [];
      block.addEventListener(type, () => reached.push('block'));
      entries['a-neighbour'].element!.addEventListener(type, () => reached.push('neighbour'));
      return reached;
    }

    it('hands a click to what its press was picked on, at the point the pointer went down at', () => {
      const reached = reaches('click');

      root.dispatchEvent(placedAt(new PointerEvent('pointerdown', { bubbles: true }), 30.4, 40.6));
      root.dispatchEvent(placedAt(new MouseEvent('mousedown', { bubbles: true }), 30, 40));
      root.dispatchEvent(placedAt(new MouseEvent('click', { bubbles: true }), 30, 40));

      expect(at[2]).toEqual(at[0]);
      expect(reached).toEqual(['block']);
    });

    it('hands a double click to what its second press was picked on', () => {
      const reached = reaches('dblclick');

      root.dispatchEvent(placedAt(new PointerEvent('pointerdown', { bubbles: true }), 30.3, 40.6));
      root.dispatchEvent(placedAt(new MouseEvent('click', { bubbles: true }), 30, 40));
      root.dispatchEvent(placedAt(new PointerEvent('pointerdown', { bubbles: true }), 30.4, 40.6));
      root.dispatchEvent(placedAt(new MouseEvent('click', { bubbles: true }), 30, 40));
      root.dispatchEvent(placedAt(new MouseEvent('dblclick', { bubbles: true }), 30, 40));

      expect(at[4]).toEqual(at[2]);
      expect(reached).toEqual(['block']);
    });

    it('picks a click at its own point once the pointer was let go of off where it went down', () => {
      const reached = reaches('click');

      root.dispatchEvent(placedAt(new PointerEvent('pointerdown', { bubbles: true }), 30.4, 40.6));
      root.dispatchEvent(placedAt(new MouseEvent('click', { bubbles: true }), 12, 40));

      expect(at[1]).toEqual({ x: 12, y: 40 });
      expect(reached).toEqual(['neighbour']);
    });

    it('picks a click at its own point where no press came before it, as a key sends it', () => {
      const reached = reaches('click');

      root.dispatchEvent(placedAt(new MouseEvent('click', { bubbles: true }), 31, 40));

      expect(at).toEqual([{ x: 31, y: 40 }]);
      expect(reached).toEqual(['block']);
    });

    it('hands the click of a tap to what the finger went down on', () => {
      const reached = reaches('click');

      root.dispatchEvent(
        placedAt(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }), 30.4, 40.6)
      );
      root.dispatchEvent(placedAt(new MouseEvent('click', { bubbles: true }), 30, 41));

      expect(at[1]).toEqual(at[0]);
      expect(reached).toEqual(['block']);
    });
  });

  it('hands a press on the table to the block picking says it lands on, and stops it there', () => {
    const { reached } = pressOn(root);
    expect(reached).toEqual(['block:mousedown', 'root:mousedown']);
  });

  it('hands the block its right click, its double click, its click and the pointer going down as well', () => {
    expect(pressOn(root, 'contextmenu').reached[0]).toBe('block:contextmenu');
    expect(pressOn(root, 'dblclick').reached[0]).toBe('block:dblclick');
    expect(pressOn(root, 'click').reached[0]).toBe('block:click');
    expect(pressOn(root, 'pointerdown').reached[0]).toBe('block:pointerdown');
  });

  it('leaves a press alone where it lands on a piece the page still draws, or on nothing picked', () => {
    expect(pressOn(piece).reached).toEqual(['root:mousedown']);
    picked = null;
    expect(pressOn(root).reached).toEqual(['root:mousedown']);
  });

  it('opens the menu of a block drawn with others, which has no element, on a right click alone', () => {
    const openMenu = vi.fn();
    entries['a-block'] = { object: {} as TabletopObject, element: null, openMenu };
    expect(pressOn(root).reached).toEqual(['root:mousedown']);
    expect(pressOn(root, 'contextmenu').reached).toEqual([]);
    expect(openMenu).toHaveBeenCalledTimes(1);
  });

  describe('a piece laid over the canvas, boxed on the screen', () => {
    let hud: HTMLElement;
    let boxed: HTMLElement;
    let part: HTMLElement;
    let label: HTMLElement;

    beforeEach(() => {
      hud = document.createElement('div');
      hud.setAttribute('data-testid', 'table-hud');
      boxed = document.createElement('div');
      boxed.setAttribute('data-object-id', 'a-die');
      const box = document.createElement('div');
      box.setAttribute('data-hud-box', '');
      part = document.createElement('div');
      part.setAttribute('data-part', 'picture');
      label = document.createElement('div');
      box.append(part, label);
      boxed.appendChild(box);
      hud.appendChild(boxed);
      piece.after(hud);
    });

    it('keeps a press on its box that picking says lands on it', () => {
      picked = 'a-die';
      expect(pressOn(part).reached).toEqual(['root:mousedown']);
    });

    it('hands a press on its box that lands on something else to that', () => {
      expect(pressOn(part).reached).toEqual(['block:mousedown', 'root:mousedown']);
    });

    it('hands a press on its box that lands on nothing to the table', () => {
      picked = null;
      const reached: EventTarget[] = [];
      const onRoot = (event: Event) => reached.push(event.target!);
      root.addEventListener('mousedown', onRoot);
      part.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      root.removeEventListener('mousedown', onRoot);
      expect(reached).toEqual([root]);
    });

    it('keeps a press a script sends to its box, aimed at it rather than at a point', () => {
      aimed = true;
      expect(pressOn(part).reached).toEqual(['root:mousedown']);
    });

    it('hands a press on a label of it that lands on something else drawn to that', () => {
      expect(pressOn(label).reached).toEqual(['block:mousedown', 'root:mousedown']);
    });

    it('keeps a press on a label of it that lands on it or on nothing', () => {
      picked = 'a-die';
      expect(pressOn(label).reached).toEqual(['root:mousedown']);
      picked = null;
      expect(pressOn(label).reached).toEqual(['root:mousedown']);
    });

    it('keeps a press on what it marks as pressed for itself, as the row of a part, wherever picking says it lands', () => {
      const row = document.createElement('div');
      row.setAttribute('data-hud-control', '');
      const name = document.createElement('span');
      row.appendChild(name);
      label.appendChild(row);
      expect(pressOn(name).reached).toEqual(['root:mousedown']);
    });

    it('keeps a press on a control of it, wherever picking says it lands', () => {
      const button = document.createElement('button');
      label.appendChild(button);
      expect(pressOn(button).reached).toEqual(['root:mousedown']);
    });
  });
});
