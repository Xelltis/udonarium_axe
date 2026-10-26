import { SceneHistory } from '@axe/domain/map-editor/history';
import { createScene, MapScene } from '@axe/domain/map-editor/scene';

function makeScene(cols = 5, rows = 5): MapScene {
  return createScene(cols, rows, 64);
}

describe('SceneHistory', () => {
  it('canUndo is false on initial state', () => {
    const scene = makeScene();
    const h = new SceneHistory(scene);
    expect(h.canUndo()).toBe(false);
  });

  it('canRedo is false on initial state', () => {
    const scene = makeScene();
    const h = new SceneHistory(scene);
    expect(h.canRedo()).toBe(false);
  });

  it('undo returns null when only baseline remains', () => {
    const scene = makeScene();
    const h = new SceneHistory(scene);
    expect(h.undo()).toBeNull();
  });

  it('redo returns null when redo stack is empty', () => {
    const scene = makeScene();
    const h = new SceneHistory(scene);
    expect(h.redo()).toBeNull();
  });

  it('commit enables undo', () => {
    const scene = makeScene();
    const h = new SceneHistory(scene);
    scene.cols = 10;
    h.commit(scene);
    expect(h.canUndo()).toBe(true);
  });

  it('undo returns scene from before commit', () => {
    const scene = makeScene(5, 5);
    const h = new SceneHistory(scene);
    scene.cols = 10;
    h.commit(scene);
    const prev = h.undo();
    expect(prev?.cols).toBe(5);
  });

  it('undo enables redo', () => {
    const scene = makeScene();
    const h = new SceneHistory(scene);
    h.commit(scene);
    h.undo();
    expect(h.canRedo()).toBe(true);
  });

  it('redo returns the committed state', () => {
    const scene = makeScene(5, 5);
    const h = new SceneHistory(scene);
    scene.cols = 10;
    h.commit(scene);
    h.undo();
    const redone = h.redo();
    expect(redone?.cols).toBe(10);
  });

  it('commit after undo clears redo stack', () => {
    const scene = makeScene();
    const h = new SceneHistory(scene);
    h.commit(scene);
    h.undo();
    h.commit(scene);
    expect(h.canRedo()).toBe(false);
  });

  it('returns clones so mutations do not affect history', () => {
    const scene = makeScene(5, 5);
    const h = new SceneHistory(scene);
    scene.cols = 10;
    h.commit(scene);
    const prev = h.undo()!;
    prev.cols = 99;
    const redone = h.redo()!;
    expect(redone.cols).toBe(10);
  });

  it('respects the limit and drops oldest entries', () => {
    const scene = makeScene();
    const h = new SceneHistory(scene, 3);
    for (let i = 1; i <= 5; i++) {
      scene.cols = i;
      h.commit(scene);
    }
    let count = 0;
    while (h.canUndo()) {
      h.undo();
      count++;
    }
    expect(count).toBe(3);
  });

  it('reset clears undo and redo stacks', () => {
    const scene = makeScene();
    const h = new SceneHistory(scene);
    h.commit(scene);
    h.reset(scene);
    expect(h.canUndo()).toBe(false);
    expect(h.canRedo()).toBe(false);
  });

  it('multiple undo/redo cycles work correctly', () => {
    const scene = makeScene(1, 1);
    const h = new SceneHistory(scene);
    scene.cols = 2;
    h.commit(scene);
    scene.cols = 3;
    h.commit(scene);
    const s2 = h.undo()!;
    expect(s2.cols).toBe(2);
    const s1 = h.undo()!;
    expect(s1.cols).toBe(1);
    expect(h.canUndo()).toBe(false);
    const r2 = h.redo()!;
    expect(r2.cols).toBe(2);
  });
});
