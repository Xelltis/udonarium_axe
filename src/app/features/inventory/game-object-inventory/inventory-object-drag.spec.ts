import { GameCharacter } from '@axe/domain/character/game-character';
import { FOLDER_DROPZONE_SELECTOR } from '@axe/features/inventory/game-object-inventory/inventory-folder-drag';
import {
  InventoryObjectDrag,
  ObjectDragHost,
} from '@axe/features/inventory/game-object-inventory/inventory-object-drag';

function pointerAt(x: number, y: number): PointerEvent {
  const target = {
    closest: () => null,
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
  };
  return { button: 0, clientX: x, clientY: y, pointerId: 1, target, currentTarget: target } as unknown as PointerEvent;
}

describe('InventoryObjectDrag', () => {
  let host: ObjectDragHost & { [key: string]: unknown };
  let drag: InventoryObjectDrag;
  let character: GameCharacter;
  let dropPath: string | null;

  beforeEach(() => {
    character = GameCharacter.create('ゴブリン', 1, '');
    dropPath = null;
    host = {
      canFile: () => true,
      canHandOver: () => true,
      travellingWith: (who: GameCharacter) => new Set([who.identifier]),
      ownsPoint: () => true,
      handOverBegin: vi.fn(),
      handOverMove: vi.fn(),
      handOverEnd: vi.fn(),
      fileInto: vi.fn(),
    } as unknown as ObjectDragHost & { [key: string]: unknown };
    drag = new InventoryObjectDrag(host);
    vi.spyOn(document, 'elementFromPoint').mockImplementation(
      () =>
        ({
          closest: (selector: string) =>
            selector === FOLDER_DROPZONE_SELECTOR && dropPath !== null ? { getAttribute: () => dropPath } : null,
        }) as unknown as Element
    );
  });

  afterEach(() => vi.restoreAllMocks());

  it('arms nothing while there is nowhere to drop', () => {
    host['canFile'] = () => false;
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
    expect(host['handOverBegin']).toHaveBeenCalledWith(character, 40, 40);
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

  it('hands the piece over when it is let go outside a folder', () => {
    drag.down(pointerAt(0, 0), character);
    drag.move(pointerAt(40, 40));
    drag.up(pointerAt(40, 40));

    expect(host['fileInto']).not.toHaveBeenCalled();
    expect(host['handOverEnd']).toHaveBeenCalledWith(false);
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
    host['ownsPoint'] = () => false;
    drag.down(pointerAt(0, 0), character);
    drag.move(pointerAt(40, 40));

    expect(drag.isDropFolder('第1話')).toBe(false);
  });
});
