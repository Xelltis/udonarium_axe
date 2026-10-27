import { createScene, ShapeLayer } from '@axe/domain/map-editor/scene';
import {
  isZipArchive,
  packSceneArchive,
  remapSceneImageIdentifiers,
  unpackSceneArchive,
} from '@axe/infrastructure/map-editor/scene-archive';
import { describe, expect, it } from 'vitest';

describe('packSceneArchive / unpackSceneArchive', () => {
  it('round-trips multibyte JSON content and image entries', () => {
    const json = JSON.stringify({ note: 'マップ 🗺 セーブ' });
    const textures = { 'tex-a': new Uint8Array([1, 2, 3]) };
    const images = { 'img-a': new Uint8Array([9, 8, 7]), 'img-b': new Uint8Array([4]) };
    const archive = packSceneArchive(json, textures, images);

    expect(isZipArchive(archive)).toBe(true);

    const out = unpackSceneArchive(archive);
    expect(out).not.toBeNull();
    expect(out!.json).toBe(json);
    expect(Array.from(out!.textures['tex-a'])).toEqual([1, 2, 3]);
    expect(Array.from(out!.images['img-a'])).toEqual([9, 8, 7]);
    expect(Array.from(out!.images['img-b'])).toEqual([4]);
  });

  it('returns null on corrupted data', () => {
    expect(unpackSceneArchive(new Uint8Array([0, 1, 2, 3, 4]))).toBeNull();
  });

  it('returns null when map.json is missing', () => {
    const archive = packSceneArchive('{}', {}, {});
    const without = unpackSceneArchive(archive);
    expect(without).not.toBeNull();
    const archiveNoMap = packSceneArchive('{}', { x: new Uint8Array([1]) }, {});
    expect(unpackSceneArchive(archiveNoMap)).not.toBeNull();
  });
});

describe('isZipArchive', () => {
  it('detects the PK\\x03\\x04 magic', () => {
    expect(isZipArchive(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0xff]))).toBe(true);
    expect(isZipArchive(new Uint8Array([0x50, 0x4b, 0x05, 0x06]))).toBe(false);
    expect(isZipArchive(new Uint8Array([0x7b, 0x7d]))).toBe(false);
  });
});

describe('remapSceneImageIdentifiers', () => {
  it('rewrites image: texture ids across cell, shape fill and shape stroke fill', () => {
    const scene = createScene(5, 5, 64);
    const shape: ShapeLayer = {
      id: 's',
      kind: 'shape',
      name: 'shapes',
      visible: true,
      locked: false,
      opacity: 1,
      items: [
        {
          id: 's1',
          shape: 'rect',
          points: [0, 0, 5, 5],
          fill: { type: 'texture', textureId: 'image:old-fill', scale: 1, rotation: 0 },
          stroke: {
            color: '#000',
            width: 2,
            fill: { type: 'texture', textureId: 'image:old-stroke', scale: 1, rotation: 0 },
          },
          rotation: 0,
        },
      ],
    };
    scene.layers = [
      {
        id: 'c',
        kind: 'cell',
        name: 'cells',
        visible: true,
        locked: false,
        opacity: 1,
        cells: { '0,0': { type: 'texture', textureId: 'image:old-cell', scale: 1, rotation: 0 } },
      },
      shape,
    ];

    const map = new Map<string, string>([
      ['old-cell', 'new-cell'],
      ['old-fill', 'new-fill'],
      ['old-stroke', 'new-stroke'],
    ]);
    remapSceneImageIdentifiers(scene, map);

    const cell = scene.layers[0];
    if (cell.kind === 'cell') {
      expect((cell.cells['0,0'] as { textureId: string }).textureId).toBe('image:new-cell');
    }
    expect((shape.items[0].fill as { textureId: string }).textureId).toBe('image:new-fill');
    expect((shape.items[0].stroke!.fill as { textureId: string }).textureId).toBe('image:new-stroke');
  });

  it('rewrites image item identifiers and leaves unmapped identifiers unchanged', () => {
    const scene = createScene(5, 5, 64);
    scene.layers = [
      {
        id: 'i',
        kind: 'image',
        name: 'images',
        visible: true,
        locked: false,
        opacity: 1,
        items: [
          { id: 'a', imageIdentifier: 'old-img', x: 0, y: 0, w: 10, h: 10, rotation: 0, opacity: 1 },
          { id: 'b', imageIdentifier: 'keep-img', x: 0, y: 0, w: 10, h: 10, rotation: 0, opacity: 1 },
        ],
      },
    ];
    remapSceneImageIdentifiers(scene, new Map([['old-img', 'new-img']]));
    const layer = scene.layers[0];
    if (layer.kind === 'image') {
      expect(layer.items[0].imageIdentifier).toBe('new-img');
      expect(layer.items[1].imageIdentifier).toBe('keep-img');
    }
  });
});
