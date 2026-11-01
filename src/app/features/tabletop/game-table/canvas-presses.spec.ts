import type { TabletopOverlapRegistryEntry } from '@axe/application/ui/tabletop-overlap.service';
import type { TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import { handCanvasPressesOn } from '@axe/features/tabletop/game-table/canvas-presses';

describe('handing presses on the canvas to the blocks drawn there', () => {
  let root: HTMLElement;
  let block: HTMLElement;
  let piece: HTMLElement;
  let onCanvas: boolean;
  let picked: string | null;
  let entries: Record<string, TabletopOverlapRegistryEntry>;
  let remove: () => void;

  beforeEach(() => {
    root = document.createElement('div');
    block = document.createElement('div');
    piece = document.createElement('div');
    piece.setAttribute('data-object-id', 'a-piece');
    root.append(block, piece);
    document.body.appendChild(root);
    onCanvas = true;
    picked = 'a-block';
    entries = { 'a-block': { object: {} as TabletopObject, element: block } };
    remove = handCanvasPressesOn(root, {
      drawsOnCanvas: () => onCanvas,
      pickAt: () => picked,
      entryOf: (identifier) => entries[identifier],
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

  it('hands a press on the table to the block picking says it lands on, and stops it there', () => {
    const { reached } = pressOn(root);
    expect(reached).toEqual(['block:mousedown', 'root:mousedown']);
  });

  it('hands the block its right click and its double click as well', () => {
    expect(pressOn(root, 'contextmenu').reached[0]).toBe('block:contextmenu');
    expect(pressOn(root, 'dblclick').reached[0]).toBe('block:dblclick');
  });

  it('leaves a press alone where it lands on a piece the page still draws, or on nothing picked', () => {
    expect(pressOn(piece).reached).toEqual(['root:mousedown']);
    picked = null;
    expect(pressOn(root).reached).toEqual(['root:mousedown']);
  });

  it('leaves every press alone while the table is drawn in the page', () => {
    onCanvas = false;
    expect(pressOn(root).reached).toEqual(['root:mousedown']);
  });

  it('opens the menu of a block drawn with others, which has no element, on a right click alone', () => {
    const openMenu = vi.fn();
    entries['a-block'] = { object: {} as TabletopObject, element: null, openMenu };
    expect(pressOn(root).reached).toEqual(['root:mousedown']);
    expect(pressOn(root, 'contextmenu').reached).toEqual([]);
    expect(openMenu).toHaveBeenCalledTimes(1);
  });
});
