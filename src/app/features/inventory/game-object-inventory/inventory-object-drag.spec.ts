import { GameCharacter } from '@axe/domain/character/game-character';
import { INVENTORY_TAB_DROPZONE_SELECTOR } from '@axe/features/inventory/game-object-inventory/inventory-folder-drag';
import {
  InventoryObjectDrag,
  ObjectDragHost,
} from '@axe/features/inventory/game-object-inventory/inventory-object-drag';
import { FOLDER_DROPZONE_SELECTOR } from '@axe/ui/folder-tree/folder-drop';

function pointerAt(x: number, y: number): PointerEvent {
  const target = {
    closest: () => null,
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
  };
  return { button: 0, clientX: x, clientY: y, pointerId: 1, target, currentTarget: target } as unknown as PointerEvent;
}

/** A row holding a text field 50 wide and 20 tall from the corner, and a gauge. */
function fieldOnRow() {
  const row = document.createElement('div');
  row.setPointerCapture = vi.fn();
  row.releasePointerCapture = vi.fn();
  const field = document.createElement('input');
  field.getBoundingClientRect = () => ({ left: 0, right: 50, top: 0, bottom: 20 }) as DOMRect;
  vi.spyOn(field, 'blur');
  const gauge = document.createElement('input');
  gauge.type = 'range';
  row.append(field, gauge);
  const pressOn = (target: Element, x: number, y: number, extra: Partial<PointerEvent> = {}) =>
    ({
      button: 0,
      buttons: 1,
      clientX: x,
      clientY: y,
      pointerId: 1,
      target,
      currentTarget: row,
      ...extra,
    }) as unknown as PointerEvent;
  return { row, field, gauge, pressOn };
}

describe('InventoryObjectDrag', () => {
  let host: ObjectDragHost & { [key: string]: unknown };
  let drag: InventoryObjectDrag;
  let character: GameCharacter;
  let dropPath: string | null;
  let dropTab: string | null;

  beforeEach(() => {
    character = GameCharacter.create('ゴブリン', 1, '');
    dropPath = null;
    dropTab = null;
    host = {
      canFile: () => true,
      canMove: () => true,
      canHandOver: () => true,
      currentTab: () => 'common',
      travellingWith: (who: GameCharacter) => new Set([who.identifier]),
      ownsElement: () => true,
      handOverBegin: vi.fn(),
      handOverEnd: vi.fn(),
      ghostBegin: vi.fn(),
      ghostMove: vi.fn(),
      ghostEnd: vi.fn(),
      fileInto: vi.fn(),
      moveTo: vi.fn(),
    } as unknown as ObjectDragHost & { [key: string]: unknown };
    drag = new InventoryObjectDrag(host);
    vi.spyOn(document, 'elementFromPoint').mockImplementation(
      () =>
        ({
          closest: (selector: string) => {
            if (selector === FOLDER_DROPZONE_SELECTOR && dropPath !== null) return { getAttribute: () => dropPath };
            if (selector === INVENTORY_TAB_DROPZONE_SELECTOR && dropTab !== null)
              return { getAttribute: () => dropTab };
            return null;
          },
        }) as unknown as Element
    );
  });

  afterEach(() => vi.restoreAllMocks());

  it('arms nothing while there is nowhere to drop', () => {
    host['canFile'] = () => false;
    host['canMove'] = () => false;
    host['canHandOver'] = () => false;

    drag.down(pointerAt(0, 0), character);
    drag.move(pointerAt(40, 40));

    expect(drag.isDragging(character)).toBe(false);
    expect(host['handOverBegin']).not.toHaveBeenCalled();
  });

  it('waits for the pointer to travel before it counts as a drag', () => {
    drag.down(pointerAt(0, 0), character);
    drag.move(pointerAt(4, 4));
    expect(drag.isDragging(character)).toBe(false);

    drag.move(pointerAt(40, 40));
    expect(drag.isDragging(character)).toBe(true);
    expect(host['handOverBegin']).toHaveBeenCalledWith(character);
  });

  it('files what was dragged into the folder under the pointer, and hands over nothing', () => {
    dropPath = '第1話';
    drag.down(pointerAt(0, 0), character);
    drag.move(pointerAt(40, 40));
    expect(drag.isDropFolder('第1話')).toBe(true);

    drag.up(pointerAt(40, 40));

    expect(host['fileInto']).toHaveBeenCalledWith(new Set([character.identifier]), '第1話');
    expect(host['handOverEnd']).toHaveBeenCalledWith(false);
    expect(drag.isDragging(character)).toBe(false);
    expect(drag.isDropFolder('第1話')).toBe(false);
  });

  it('moves what was dragged to the tab it is let go over, and hands over nothing', () => {
    dropTab = 'graveyard';
    drag.down(pointerAt(0, 0), character);
    drag.move(pointerAt(40, 40));
    expect(drag.isDropTab('graveyard')).toBe(true);

    drag.up(pointerAt(40, 40));

    expect(host['moveTo']).toHaveBeenCalledWith(new Set([character.identifier]), 'graveyard');
    expect(host['fileInto']).not.toHaveBeenCalled();
    expect(host['handOverEnd']).toHaveBeenCalledWith(false);
    expect(drag.isDropTab('graveyard')).toBe(false);
  });

  it('takes the tab on view for no place to move to', () => {
    dropTab = 'common';
    drag.down(pointerAt(0, 0), character);
    drag.move(pointerAt(40, 40));
    expect(drag.isDropTab('common')).toBe(false);

    drag.up(pointerAt(40, 40));

    expect(host['moveTo']).not.toHaveBeenCalled();
  });

  it('moves nothing for a seat that may not move pieces', () => {
    host['canMove'] = () => false;
    dropTab = 'graveyard';
    drag.down(pointerAt(0, 0), character);
    drag.move(pointerAt(40, 40));
    drag.up(pointerAt(40, 40));

    expect(host['moveTo']).not.toHaveBeenCalled();
  });

  it('arms a drag for a seat that may move pieces, with no folder or bar to drop on', () => {
    host['canFile'] = () => false;
    host['canHandOver'] = () => false;

    drag.down(pointerAt(0, 0), character);
    drag.move(pointerAt(40, 40));

    expect(drag.isDragging(character)).toBe(true);
  });

  it('hands the piece over when it is let go outside a folder', () => {
    drag.down(pointerAt(0, 0), character);
    drag.move(pointerAt(40, 40));
    drag.up(pointerAt(40, 40));

    expect(host['fileInto']).not.toHaveBeenCalled();
    expect(host['handOverEnd']).toHaveBeenCalledWith(false);
  });

  it('picks a row up from one of its fields once the pointer leaves the field, not before', () => {
    const { row, field, pressOn } = fieldOnRow();
    drag.down(pressOn(field, 10, 10), character);
    expect(row.setPointerCapture).not.toHaveBeenCalled();

    drag.move(pressOn(field, 45, 10));
    expect(drag.isDragging(character)).toBe(false);

    drag.move(pressOn(field, 45, 40));
    expect(drag.isDragging(character)).toBe(true);
    expect(row.setPointerCapture).toHaveBeenCalled();
    expect(field.blur).toHaveBeenCalled();
  });

  it('keeps a drag going when the field it began in gives up the pointer to the row, and calls it off when the row does', () => {
    const { row, field, pressOn } = fieldOnRow();
    drag.down(pressOn(field, 10, 10), character);
    drag.move(pressOn(field, 45, 40));

    drag.lostCapture({ target: field, currentTarget: row } as unknown as PointerEvent);
    expect(drag.isDragging(character)).toBe(true);

    drag.lostCapture({ target: row, currentTarget: row } as unknown as PointerEvent);
    expect(drag.isDragging(character)).toBe(false);
  });

  it('forgets a press in a field let go of outside the row, rather than dragging on a bare move', () => {
    const { field, pressOn } = fieldOnRow();
    drag.down(pressOn(field, 10, 10), character);

    drag.move(pressOn(field, 45, 40, { buttons: 0 }));
    drag.move(pressOn(field, 80, 80));

    expect(drag.isDragging(character)).toBe(false);
  });

  it('leaves a field under a finger to scroll the list', () => {
    const { field, pressOn } = fieldOnRow();
    drag.down(pressOn(field, 10, 10, { pointerType: 'touch' }), character);

    drag.move(pressOn(field, 45, 40, { pointerType: 'touch' }));

    expect(drag.isDragging(character)).toBe(false);
  });

  it('leaves a gauge, a choice or a button to do what it does', () => {
    const { gauge, pressOn } = fieldOnRow();
    drag.down(pressOn(gauge, 10, 10), character);

    drag.move(pressOn(gauge, 80, 80));

    expect(drag.isDragging(character)).toBe(false);
  });

  it('draws what is carried beside the pointer, with how many go along, until it is let go', () => {
    const village = GameCharacter.create('村長', 1, '');
    host['travellingWith'] = () => new Set([character.identifier, village.identifier]);
    drag.down(pointerAt(0, 0), character);
    drag.move(pointerAt(40, 40));
    expect(host['ghostBegin']).toHaveBeenCalledWith(character, 2, 40, 40);

    drag.move(pointerAt(50, 60));
    expect(host['ghostMove']).toHaveBeenCalledWith(50, 60);

    drag.up(pointerAt(50, 60));
    expect(host['ghostEnd']).toHaveBeenCalled();
  });

  it('draws it for a seat with no bar to hand over to as well', () => {
    host['canHandOver'] = () => false;
    drag.down(pointerAt(0, 0), character);
    drag.move(pointerAt(40, 40));

    expect(host['ghostBegin']).toHaveBeenCalledWith(character, 1, 40, 40);
    expect(host['handOverBegin']).not.toHaveBeenCalled();
  });

  it('draws nothing beside the pointer, and hands nothing over, for a row in a window of its own', () => {
    const row = document.implementation.createHTMLDocument('').createElement('div');
    row.setPointerCapture = vi.fn();
    row.releasePointerCapture = vi.fn();
    const pressOn = (x: number, y: number) =>
      ({
        button: 0,
        buttons: 1,
        clientX: x,
        clientY: y,
        pointerId: 1,
        target: row,
        currentTarget: row,
      }) as unknown as PointerEvent;

    drag.down(pressOn(0, 0), character);
    drag.move(pressOn(40, 40));
    drag.move(pressOn(50, 50));
    drag.up(pressOn(50, 50));

    expect(drag.takeSuppressedClick()).toBe(true);
    expect(host['ghostBegin']).not.toHaveBeenCalled();
    expect(host['ghostMove']).not.toHaveBeenCalled();
    expect(host['ghostEnd']).not.toHaveBeenCalled();
    expect(host['handOverBegin']).not.toHaveBeenCalled();
  });

  it('calls the hand-over off and stops drawing when the row is taken from under the pointer', () => {
    drag.down(pointerAt(0, 0), character);
    drag.move(pointerAt(40, 40));

    drag.cancel();

    expect(host['handOverEnd']).toHaveBeenCalledWith(false);
    expect(host['ghostEnd']).toHaveBeenCalled();
  });

  it('swallows the click that ends a drag, once', () => {
    drag.down(pointerAt(0, 0), character);
    drag.move(pointerAt(40, 40));
    drag.up(pointerAt(40, 40));

    expect(drag.takeSuppressedClick()).toBe(true);
    expect(drag.takeSuppressedClick()).toBe(false);
  });

  it('keeps the click of a press that never became a drag', () => {
    drag.down(pointerAt(0, 0), character);
    drag.up(pointerAt(1, 1));

    expect(drag.takeSuppressedClick()).toBe(false);
    expect(host['fileInto']).not.toHaveBeenCalled();
  });

  it('lets everything go when the row is taken from under the pointer', () => {
    dropPath = '第1話';
    drag.down(pointerAt(0, 0), character);
    drag.move(pointerAt(40, 40));

    drag.cancel();

    expect(drag.isDragging(character)).toBe(false);
    expect(drag.isDropFolder('第1話')).toBe(false);
    drag.up(pointerAt(40, 40));
    expect(host['fileInto']).not.toHaveBeenCalled();
  });

  it('takes no notice of a point over another panel showing the same room', () => {
    dropPath = '第1話';
    host['ownsElement'] = () => false;
    drag.down(pointerAt(0, 0), character);
    drag.move(pointerAt(40, 40));

    expect(drag.isDropFolder('第1話')).toBe(false);
  });
});
