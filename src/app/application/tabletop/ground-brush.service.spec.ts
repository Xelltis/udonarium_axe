import { TestBed } from '@angular/core/testing';
import { GroundService } from '@axe/application/tabletop/ground.service';
import { GroundBrushService } from '@axe/application/tabletop/ground-brush.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('GroundBrushService', () => {
  let brush: GroundBrushService;
  let ground: GroundService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    const table = new GameTable();
    table.width = 20;
    table.height = 20;
    table.gridSize = 50;
    table.initialize();
    TestBed.inject(TableSelecter).viewTableIdentifier = table.identifier;
    brush = TestBed.inject(GroundBrushService);
    ground = TestBed.inject(GroundService);
  });

  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  /** Lays a stroke, and waits for the changes it made to be told of. */
  async function stroke(points: [number, number][]): Promise<void> {
    brush.begin(...points[0]);
    for (const point of points.slice(1)) brush.dab(...point);
    brush.end();
    await settle();
  }

  /** Waits for the changes made to the ground to be told of. */
  function settle(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  it('raises the ground along a stroke, and takes the stroke back to the ground before it', async () => {
    brush.settings.set({ kind: 'raise', radius: 1, strength: 0.5, layer: 'grass' });
    await stroke([
      [4, 4],
      [5, 4],
    ]);

    expect(ground.surface().heightAt(4, 4)).toBeGreaterThan(0);
    expect(brush.undoable()).toBe(1);

    brush.undo();
    await settle();

    expect(ground.surface().heightAt(4, 4)).toBe(0);
    expect(brush.undoable()).toBe(0);
  });

  it('takes back one stroke at a time, the last first', async () => {
    brush.settings.set({ kind: 'raise', radius: 1, strength: 0.5, layer: 'grass' });
    await stroke([[4, 4]]);
    await stroke([[4, 4]]);

    brush.undo();
    await settle();

    expect(ground.surface().heightAt(4, 4)).toBe(0.5);
  });

  it('takes back the stroke under way as though it had not been laid, leaving the earlier one to take back', async () => {
    brush.settings.set({ kind: 'raise', radius: 1, strength: 0.5, layer: 'grass' });
    await stroke([[4, 4]]);
    brush.begin(4, 4);
    brush.dab(5, 4);
    await settle();
    expect(ground.surface().heightAt(4, 4)).toBe(1);

    brush.cancel();
    await settle();

    expect(ground.surface().heightAt(4, 4)).toBe(0.5);
    expect(brush.undoable()).toBe(1);
  });

  it('flattens towards the height the stroke started at', async () => {
    brush.settings.set({ kind: 'raise', radius: 1, strength: 1, layer: 'grass' });
    await stroke([[4, 4]]);
    brush.settings.set({ kind: 'flatten', radius: 2, strength: 1, layer: 'grass' });

    await stroke([
      [8, 4],
      [4, 4],
    ]);

    expect(ground.surface().heightAt(4, 4)).toBe(0);
  });
});
