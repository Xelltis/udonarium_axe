import { GameTable } from '@axe/domain/tabletop/game-table';
import {
  asTableLayerPlacement,
  DEFAULT_BACKDROP_FOLLOW,
  DEFAULT_BACKDROP_HEIGHT,
  MAX_TABLE_BACKGROUND_LAYERS,
  moveBackgroundLayer,
  TableBackgroundLayer,
} from '@axe/domain/tabletop/table-background-layer';

describe('TableBackgroundLayer', () => {
  it('starts as a layer that is on but standing still, so nothing moves unasked', () => {
    const layer = new TableBackgroundLayer();
    layer.initialize();

    expect(layer.enabled).toBe(true);
    expect(layer.speedX).toBe(0);
    expect(layer.speedY).toBe(0);
    expect(layer.opacity).toBe(1);
    expect(layer.scale).toBe(1);
    expect(layer.placedOver).toBe(false);

    layer.destroy();
  });

  it('allows six between the two sides of the board', () => {
    expect(MAX_TABLE_BACKGROUND_LAYERS).toBe(6);
  });

  it('reads back a side the room can be trusted on, whatever it sent', () => {
    const layer = new TableBackgroundLayer();
    layer.initialize();

    layer.placement = 'over';
    expect(layer.placedOver).toBe(true);

    layer.placement = 'sideways';
    expect(layer.placedOver).toBe(false);

    layer.destroy();
  });
});

describe('a backdrop', () => {
  function layer(): TableBackgroundLayer {
    const made = new TableBackgroundLayer();
    made.initialize();
    return made;
  }

  it('is told apart from the layers under and over the board', () => {
    const backdrop = layer();
    backdrop.placement = 'backdrop';

    expect(backdrop.placedBackdrop).toBe(true);
    expect(backdrop.placedOver).toBe(false);
    backdrop.destroy();
  });

  it('starts following the camera enough to be seen to move, standing at the foot of the screen', () => {
    const backdrop = layer();

    expect(backdrop.follow).toBe(DEFAULT_BACKDROP_FOLLOW);
    expect(backdrop.height).toBe(DEFAULT_BACKDROP_HEIGHT);
    backdrop.destroy();
  });

  it('keeps nought as nought, which is a backdrop that stands still', () => {
    const backdrop = layer();
    backdrop.cameraFollow = 0;

    expect(backdrop.follow).toBe(0);
    backdrop.destroy();
  });

  it('reads nothing, or anything that is not a number, as the defaults rather than as nought', () => {
    const backdrop = layer();
    for (const sent of ['', 'far', null, undefined, Number.NaN]) {
      (backdrop as unknown as Record<string, unknown>)['cameraFollow'] = sent;
      (backdrop as unknown as Record<string, unknown>)['backdropHeight'] = sent;
      expect(backdrop.follow).toBe(DEFAULT_BACKDROP_FOLLOW);
      expect(backdrop.height).toBe(DEFAULT_BACKDROP_HEIGHT);
    }
    backdrop.destroy();
  });

  it('keeps its follow and height when an older peer, changing something else, passes the layer back', () => {
    const backdrop = layer();
    backdrop.placement = 'backdrop';
    backdrop.cameraFollow = 0.6;
    backdrop.backdropHeight = 0.4;

    // A layer's fields travel in its attributes; an older peer passes back the ones it does not
    // know along with the one it changed.
    const fromOlderPeer = backdrop.toContext();
    const data = fromOlderPeer.syncData as { attributes: Record<string, unknown> };
    fromOlderPeer.syncData = { ...data, attributes: { ...data.attributes, opacity: 0.5 } };
    fromOlderPeer.majorVersion += 1;
    backdrop.apply(fromOlderPeer);

    expect([backdrop.follow, backdrop.height, backdrop.opacity]).toEqual([0.6, 0.4, 0.5]);
    backdrop.destroy();
  });

  it('reads the defaults for a layer sent with neither field at all', () => {
    const backdrop = layer();
    const sent = backdrop.toContext();
    const data = sent.syncData as { attributes: Record<string, unknown> };
    const { cameraFollow: _follow, backdropHeight: _height, ...known } = data.attributes;
    sent.syncData = { ...data, attributes: known };
    sent.majorVersion += 1;
    backdrop.apply(sent);

    expect([backdrop.follow, backdrop.height]).toEqual([DEFAULT_BACKDROP_FOLLOW, DEFAULT_BACKDROP_HEIGHT]);
    backdrop.destroy();
  });

  it('holds what it reads between nought and one, and reads a number sent as text', () => {
    const backdrop = layer();
    backdrop.cameraFollow = 3;
    backdrop.backdropHeight = -1;
    expect(backdrop.follow).toBe(1);
    expect(backdrop.height).toBe(0);

    (backdrop as unknown as Record<string, unknown>)['cameraFollow'] = '0.6';
    expect(backdrop.follow).toBe(0.6);
    backdrop.destroy();
  });
});

describe('asTableLayerPlacement()', () => {
  it('takes the sides it knows', () => {
    expect(asTableLayerPlacement('under')).toBe('under');
    expect(asTableLayerPlacement('over')).toBe('over');
    expect(asTableLayerPlacement('backdrop')).toBe('backdrop');
  });

  it('falls back to beneath the board, which is what a background is', () => {
    expect(asTableLayerPlacement('above')).toBe('under');
    expect(asTableLayerPlacement(undefined)).toBe('under');
    expect(asTableLayerPlacement(3)).toBe('under');
  });
});

describe('moveBackgroundLayer()', () => {
  const run = ['a', 'b', 'c'] as unknown as TableBackgroundLayer[];

  it('takes one a step through the run', () => {
    expect(moveBackgroundLayer(run, 2, -1)).toEqual(['a', 'c', 'b']);
    expect(moveBackgroundLayer(run, 0, 1)).toEqual(['b', 'a', 'c']);
  });

  it('leaves the run as it was at either end', () => {
    expect(moveBackgroundLayer(run, 0, -1)).toEqual(['a', 'b', 'c']);
    expect(moveBackgroundLayer(run, 2, 1)).toEqual(['a', 'b', 'c']);
  });

  it('leaves the run as it was for a layer that is not in it', () => {
    expect(moveBackgroundLayer(run, -1, 1)).toEqual(['a', 'b', 'c']);
    expect(moveBackgroundLayer(run, 9, -1)).toEqual(['a', 'b', 'c']);
  });

  it('hands back a run of its own rather than shuffling the one it was given', () => {
    const given = [...run];
    moveBackgroundLayer(given, 0, 1);

    expect(given).toEqual(run);
  });
});

describe('GameTable.backgroundLayers', () => {
  it('has none until one is laid', () => {
    const table = new GameTable();
    table.initialize();

    expect(table.backgroundLayers).toEqual([]);

    table.destroy();
  });

  it('brings them furthest back first', () => {
    const table = new GameTable();
    table.initialize();
    const near = new TableBackgroundLayer();
    near.initialize();
    near.order = 2;
    const far = new TableBackgroundLayer();
    far.initialize();
    far.order = 0;
    const middle = new TableBackgroundLayer();
    middle.initialize();
    middle.order = 1;
    table.appendChild(near);
    table.appendChild(middle);
    table.appendChild(far);

    expect(table.backgroundLayers.map((layer) => layer.order)).toEqual([0, 1, 2]);

    table.destroy();
  });

  it('leaves the rest of what the table holds out of it', () => {
    const table = new GameTable();
    table.initialize();
    const layer = new TableBackgroundLayer();
    layer.initialize();
    table.appendChild(layer);

    expect(table.backgroundLayers).toHaveLength(1);
    expect(table.backgroundLayers[0].identifier).toBe(layer.identifier);

    table.destroy();
  });
});
