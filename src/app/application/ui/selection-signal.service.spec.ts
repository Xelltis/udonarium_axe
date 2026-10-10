import { TestBed } from '@angular/core/testing';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';

describe('SelectionSignalService', () => {
  let service: SelectionSignalService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SelectionSignalService);
  });

  it('selects nothing to begin with', () => {
    expect(service.selectedObject()).toBeNull();
  });

  it('highlights nothing to begin with', () => {
    expect(service.highlightedObject()).toBeNull();
  });

  it('focuses nowhere to begin with', () => {
    expect(service.focusCoordinate()).toBeNull();
  });

  it('records the object that was selected', () => {
    service.selectObject('test-id', 'GameCharacter');

    const result = service.selectedObject();
    expect(result).toEqual({ identifier: 'test-id', className: 'GameCharacter' });
  });

  it('records the object that was highlighted', () => {
    service.highlightObject('highlight-id');

    const result = service.highlightedObject();
    expect(result).not.toBeNull();
    expect(result!.identifier).toBe('highlight-id');
    expect(result!.timestamp).toBeGreaterThan(0);
  });

  it('records the coordinate that was focused', () => {
    service.focusToCoordinate(100, 200);

    const result = service.focusCoordinate();
    expect(result).not.toBeNull();
    expect(result!.x).toBe(100);
    expect(result!.y).toBe(200);
    expect(result!.timestamp).toBeGreaterThan(0);
  });

  it('stamps each highlight with its own time', async () => {
    service.highlightObject('id-1');
    const first = service.highlightedObject();

    await new Promise((resolve) => setTimeout(resolve, 5));

    service.highlightObject('id-1');
    const second = service.highlightedObject();

    expect(second!.timestamp).toBeGreaterThanOrEqual(first!.timestamp);
  });

  it('replaces the previous selection', () => {
    service.selectObject('first-id', 'ClassA');
    service.selectObject('second-id', 'ClassB');

    const result = service.selectedObject();
    expect(result).toEqual({ identifier: 'second-id', className: 'ClassB' });
  });

  it('bumps the version when a table gesture is cancelled', () => {
    const initial = service.cancelTableGestureVersion();
    service.cancelTableGesture();
    expect(service.cancelTableGestureVersion()).toBe(initial + 1);
  });

  it('keeps bumping the version on repeated cancels', () => {
    const initial = service.cancelTableGestureVersion();
    service.cancelTableGesture();
    service.cancelTableGesture();
    service.cancelTableGesture();
    expect(service.cancelTableGestureVersion()).toBe(initial + 3);
  });

  describe('the multiple selection api', () => {
    it('starts with nothing selected', () => {
      expect(service.selectedObjects()).toBeInstanceOf(Set);
      expect(service.selectedObjects().size).toBe(0);
      expect(service.selectionSize()).toBe(0);
    });

    it('adds an identifier to the selection', () => {
      service.addSelection('id-1', 'GameCharacter');
      expect(service.isSelected('id-1')).toBe(true);
      expect(service.selectionSize()).toBe(1);
      expect(service.selectedObject()).toEqual({ identifier: 'id-1', className: 'GameCharacter' });
    });

    it('adds the same identifier only once', () => {
      service.addSelection('id-1');
      service.addSelection('id-1');
      expect(service.selectionSize()).toBe(1);
    });

    it('removes an identifier from the selection', () => {
      service.addSelection('id-1');
      service.addSelection('id-2');
      service.removeSelection('id-1');
      expect(service.isSelected('id-1')).toBe(false);
      expect(service.isSelected('id-2')).toBe(true);
    });

    it('toggles an identifier in and out of the selection', () => {
      service.toggleSelection('id-1', 'GameCharacter');
      expect(service.isSelected('id-1')).toBe(true);
      service.toggleSelection('id-1');
      expect(service.isSelected('id-1')).toBe(false);
    });

    it('replaces the whole selection', () => {
      service.addSelection('id-1');
      service.addSelection('id-2');
      service.replaceSelection(['id-3', 'id-4'], { identifier: 'id-3', className: 'DiceSymbol' });
      expect(service.isSelected('id-1')).toBe(false);
      expect(service.isSelected('id-3')).toBe(true);
      expect(service.isSelected('id-4')).toBe(true);
      expect(service.selectedObject()?.identifier).toBe('id-3');
    });

    it('empties the selection', () => {
      service.addSelection('id-1');
      service.addSelection('id-2');
      service.clearSelection();
      expect(service.selectionSize()).toBe(0);
    });

    it('hands back a new set each time it changes', () => {
      const before = service.selectedObjects();
      service.addSelection('id-1');
      const after = service.selectedObjects();
      expect(after).not.toBe(before);
    });
  });

  describe('a press on a piece', () => {
    it('adds the piece or takes it out when toggling, and spends the press', () => {
      expect(service.press('id-1', 'terrain', true)).toBe(true);
      expect(service.isSelected('id-1')).toBe(true);
      expect(service.selectedObject()).toEqual({ identifier: 'id-1', className: 'terrain' });

      expect(service.press('id-1', 'terrain', true)).toBe(true);
      expect(service.isSelected('id-1')).toBe(false);
    });

    it('narrows a selection to a piece outside it, and lets the press go on', () => {
      service.replaceSelection(['id-1', 'id-2']);

      expect(service.press('id-3', 'terrain', false)).toBe(false);
      expect([...service.selectedObjects()]).toEqual(['id-3']);
      expect(service.selectedObject()?.identifier).toBe('id-3');
    });

    it('leaves a selection alone for a press on a piece inside it, so the group can be dragged', () => {
      service.replaceSelection(['id-1', 'id-2']);

      expect(service.press('id-2', 'terrain', false)).toBe(false);
      expect([...service.selectedObjects()]).toEqual(['id-1', 'id-2']);
    });

    it('selects nothing for a plain press with nothing selected', () => {
      expect(service.press('id-1', 'terrain', false)).toBe(false);
      expect(service.selectionSize()).toBe(0);
    });
  });

  describe('marqueeState', () => {
    it('starts as null', () => {
      expect(service.marqueeState()).toBeNull();
    });

    it('updates as a signal', () => {
      service.marqueeState.set({ x1: 0, y1: 0, x2: 100, y2: 100 });
      expect(service.marqueeState()).toEqual({ x1: 0, y1: 0, x2: 100, y2: 100 });
    });
  });
});
