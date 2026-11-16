import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TableBackgroundLayersComponent } from '@axe/features/tabletop/game-table-setting/table-background-layers.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

/** What drifts behind, under and over the board, as the table's settings list it. */
describe('TableBackgroundLayersComponent', () => {
  let component: TableBackgroundLayersComponent;
  let fixture: ComponentFixture<TableBackgroundLayersComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TableBackgroundLayersComponent],
      providers: [...TEST_PROVIDERS],
    });
    fixture = TestBed.createComponent(TableBackgroundLayersComponent);
    component = fixture.componentInstance;
  });

  const withTable = (): GameTable => {
    const table = new GameTable();
    table.initialize();
    fixture.componentRef.setInput('table', table);
    fixture.componentRef.setInput('editable', true);
    return table;
  };

  it('lays a layer, and puts each new one in front of the last', () => {
    const table = withTable();
    try {
      component.addBackgroundLayer();
      component.addBackgroundLayer();

      expect(table.backgroundLayers.map((layer) => layer.order)).toEqual([0, 1]);
    } finally {
      table.destroy();
    }
  });

  it('stops at six between the two sides of the board', () => {
    const table = withTable();
    try {
      for (let laid = 0; laid < 6; laid++) component.addBackgroundLayer();
      expect(component.canAddBackgroundLayer).toBe(false);

      component.addBackgroundLayer();
      expect(table.backgroundLayers).toHaveLength(6);
    } finally {
      table.destroy();
    }
  });

  it('takes one away again', () => {
    const table = withTable();
    try {
      component.addBackgroundLayer();
      component.removeBackgroundLayer(table.backgroundLayers[0]);

      expect(table.backgroundLayers).toEqual([]);
    } finally {
      table.destroy();
    }
  });

  it('writes what it is asked onto the table, which the room shares', () => {
    const table = withTable();
    try {
      component.addBackgroundLayer();
      const layer = table.backgroundLayers[0];

      component.setBackgroundLayerSpeedX(layer, -120);
      component.setBackgroundLayerSpeedY(layer, 40);
      component.setBackgroundLayerOpacityPercent(layer, 60);
      component.setBackgroundLayerScale(layer, 2);
      component.setBackgroundLayerEnabled(layer, false);
      component.setBackgroundLayerPlacement(layer, 'over');

      expect(layer.placedOver).toBe(true);
      expect(layer.speedX).toBe(-120);
      expect(layer.speedY).toBe(40);
      expect(layer.opacity).toBeCloseTo(0.6, 5);
      expect(layer.scale).toBe(2);
      expect(layer.enabled).toBe(false);
    } finally {
      table.destroy();
    }
  });

  it('holds a runaway speed and an unreadable scale to what the board can show', () => {
    const table = withTable();
    try {
      component.addBackgroundLayer();
      const layer = table.backgroundLayers[0];

      component.setBackgroundLayerSpeedX(layer, 999999);
      component.setBackgroundLayerScale(layer, 999);
      component.setBackgroundLayerOpacityPercent(layer, 500);

      expect(layer.speedX).toBe(component.maxBackgroundScrollSpeed);
      expect(layer.scale).toBe(component.maxBackgroundLayerScale);
      expect(layer.opacity).toBe(1);
    } finally {
      table.destroy();
    }
  });

  it('writes nothing to a table that is no longer there to be edited', () => {
    const table = withTable();
    component.addBackgroundLayer();
    const layer = table.backgroundLayers[0];
    // A table taken out of the store counts as deleted, and a deleted one is not editable.
    ObjectStore.instance.remove(table);

    component.setBackgroundLayerSpeedX(layer, 100);
    component.setBackgroundLayerPlacement(layer, 'over');
    component.moveBackgroundLayer(layer, -1);
    component.removeBackgroundLayer(layer);

    expect(layer.speedX).toBe(0);
    expect(layer.placedOver).toBe(false);
    expect(table.backgroundLayers).toHaveLength(1);

    layer.destroy();
  });

  it('stands a layer behind the table, and writes how much it follows the camera and how high it stands', () => {
    const table = withTable();
    try {
      component.addBackgroundLayer();
      const layer = table.backgroundLayers[0];

      component.setBackgroundLayerPlacement(layer, 'backdrop');
      component.setBackgroundLayerFollowPercent(layer, 60);
      component.setBackgroundLayerHeightPercent(layer, 25);

      expect(layer.placedBackdrop).toBe(true);
      expect(component.backgroundLayerFollowPercent(layer)).toBe(60);
      expect(component.backgroundLayerHeightPercent(layer)).toBe(25);
    } finally {
      table.destroy();
    }
  });

  it('holds the follow and the height between nought and a hundred, and ignores what cannot be read', () => {
    const table = withTable();
    try {
      component.addBackgroundLayer();
      const layer = table.backgroundLayers[0];
      component.setBackgroundLayerPlacement(layer, 'backdrop');

      component.setBackgroundLayerFollowPercent(layer, 500);
      component.setBackgroundLayerHeightPercent(layer, -20);
      expect([layer.follow, layer.height]).toEqual([1, 0]);

      component.setBackgroundLayerFollowPercent(layer, Number.NaN);
      expect(layer.follow).toBe(1);
    } finally {
      table.destroy();
    }
  });

  it('offers the follow and the height only for a layer behind the table, and no drift up or down for it', async () => {
    const table = withTable();
    try {
      component.addBackgroundLayer();
      const layer = table.backgroundLayers[0];
      const settle = async () => {
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();
      };
      await settle();
      const root = fixture.nativeElement as HTMLElement;
      expect(root.querySelector('[data-testid="background-layer-row"]')).not.toBeNull();
      expect(root.querySelector('[data-testid="background-layer-follow"]')).toBeNull();

      component.setBackgroundLayerPlacement(layer, 'backdrop');
      await settle();

      expect(root.querySelector('[data-testid="background-layer-follow"]')).not.toBeNull();
      expect(root.querySelector('[data-testid="background-layer-height"]')).not.toBeNull();
      expect(root.querySelector<HTMLInputElement>('[data-testid="background-layer-speed-y"]')!.disabled).toBe(true);
    } finally {
      table.destroy();
    }
  });

  it('lists the layers behind the table first, each side counted on its own', () => {
    const table = withTable();
    try {
      component.addBackgroundLayer();
      component.addBackgroundLayer();
      component.addBackgroundLayer();
      const [under, backdrop, over] = table.backgroundLayers;
      component.setBackgroundLayerPlacement(backdrop, 'backdrop');
      component.setBackgroundLayerPlacement(over, 'over');

      expect(component.backgroundLayers).toEqual([backdrop, under, over]);
      expect(component.canMoveBackgroundLayer(backdrop, 1)).toBe(false);
    } finally {
      table.destroy();
    }
  });

  it('writes no follow to a table that is no longer there to be edited', () => {
    const table = withTable();
    component.addBackgroundLayer();
    const layer = table.backgroundLayers[0];
    ObjectStore.instance.remove(table);

    component.setBackgroundLayerFollowPercent(layer, 90);

    expect(layer.follow).not.toBe(0.9);
    layer.destroy();
  });

  it('shows the two sides apart, everything under the board before everything over it', () => {
    const table = withTable();
    try {
      component.addBackgroundLayer();
      component.addBackgroundLayer();
      component.setBackgroundLayerPlacement(table.backgroundLayers[0], 'over');
      const shown = component.backgroundLayers;

      expect(shown.map((layer) => layer.placedOver)).toEqual([false, true]);
      expect(component.backgroundLayerNumber(shown[0])).toBe(1);
      expect(component.backgroundLayerNumber(shown[1])).toBe(1);
    } finally {
      table.destroy();
    }
  });

  it('moves one a step through its run and numbers the run again', () => {
    const table = withTable();
    try {
      component.addBackgroundLayer();
      component.addBackgroundLayer();
      component.addBackgroundLayer();
      const [first, second, third] = component.backgroundLayers;

      component.moveBackgroundLayer(third, -1);

      expect(component.backgroundLayers).toEqual([first, third, second]);
      expect(component.backgroundLayers.map((layer) => layer.order)).toEqual([0, 1, 2]);
    } finally {
      table.destroy();
    }
  });

  it('will not move one past either end of its run', () => {
    const table = withTable();
    try {
      component.addBackgroundLayer();
      component.addBackgroundLayer();
      const [first, second] = component.backgroundLayers;

      expect(component.canMoveBackgroundLayer(first, -1)).toBe(false);
      expect(component.canMoveBackgroundLayer(second, 1)).toBe(false);
      expect(component.canMoveBackgroundLayer(first, 1)).toBe(true);

      component.moveBackgroundLayer(first, -1);
      expect(component.backgroundLayers).toEqual([first, second]);
    } finally {
      table.destroy();
    }
  });

  it('counts only its own side of the board when moving, since the runs are drawn apart', () => {
    const table = withTable();
    try {
      component.addBackgroundLayer();
      component.addBackgroundLayer();
      const over = component.backgroundLayers[1];
      component.setBackgroundLayerPlacement(over, 'over');

      // Alone on its side, so there is nowhere for it to go.
      expect(component.canMoveBackgroundLayer(over, -1)).toBe(false);
      expect(component.canMoveBackgroundLayer(over, 1)).toBe(false);
    } finally {
      table.destroy();
    }
  });

  it('writes nothing while the settings it stands in do not let the table be changed', () => {
    const table = withTable();
    try {
      component.addBackgroundLayer();
      const layer = table.backgroundLayers[0];
      fixture.componentRef.setInput('editable', false);

      component.setBackgroundLayerSpeedX(layer, 100);
      component.addBackgroundLayer();
      component.removeBackgroundLayer(layer);

      expect(layer.speedX).toBe(0);
      expect(table.backgroundLayers).toHaveLength(1);
      expect(component.canAddBackgroundLayer).toBe(false);
      expect(component.canMoveBackgroundLayer(layer, 1)).toBe(false);
    } finally {
      table.destroy();
    }
  });

  it('draws each layer with its place in its run, and the steps it can take', async () => {
    const table = withTable();
    try {
      component.addBackgroundLayer();
      component.addBackgroundLayer();
      component.addBackgroundLayer();
      component.setBackgroundLayerPlacement(table.backgroundLayers[2], 'over');
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const root = fixture.nativeElement as HTMLElement;
      const rows = Array.from(root.querySelectorAll<HTMLElement>('[data-testid="background-layer-row"]'));
      const up = (row: HTMLElement) =>
        row.querySelector<HTMLButtonElement>('[data-testid="background-layer-move-up"]')!.disabled;
      const down = (row: HTMLElement) =>
        row.querySelector<HTMLButtonElement>('[data-testid="background-layer-move-down"]')!.disabled;

      expect(rows).toHaveLength(3);
      expect(rows.map(up)).toEqual([true, false, true]);
      expect(rows.map(down)).toEqual([false, true, true]);
      expect(root.querySelector<HTMLButtonElement>('[data-testid="background-layer-add"]')!.disabled).toBe(false);
    } finally {
      table.destroy();
    }
  });
});
