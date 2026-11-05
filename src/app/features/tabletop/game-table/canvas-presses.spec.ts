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

    it('keeps a press on a control of it, wherever picking says it lands', () => {
      const button = document.createElement('button');
      label.appendChild(button);
      expect(pressOn(button).reached).toEqual(['root:mousedown']);
    });
  });
});
