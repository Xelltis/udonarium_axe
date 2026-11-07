import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  BUNDLED_PIECE_MODELS,
  bundledMapModels,
  bundledModelName,
  bundledPieceModelUrl,
  isAppModel,
  isBundledMapModel,
  isBundledModel,
} from '@axe/core/storage/bundled-models';
import { describe, expect, it } from 'vitest';

const ASSETS = join(process.cwd(), 'src/assets');

describe('bundled piece models', () => {
  it('name each file bundled by the SHA-256 of its bytes, and every file bundled', () => {
    const files = readdirSync(join(ASSETS, 'models/pieces')).filter((file) => file.endsWith('.glb'));
    expect(files.map((file) => file.replace(/\.glb$/, '')).sort()).toEqual(Object.keys(BUNDLED_PIECE_MODELS).sort());
    for (const [name, identifier] of Object.entries(BUNDLED_PIECE_MODELS)) {
      const bytes = readFileSync(
        join(ASSETS, bundledPieceModelUrl(name as keyof typeof BUNDLED_PIECE_MODELS).replace(/^assets\//, ''))
      );
      expect(createHash('sha256').update(bytes).digest('hex'), name).toBe(identifier);
    }
  });

  it('tell a bundled model by its identifier, and a model a seat added apart from them', () => {
    expect(isBundledModel(BUNDLED_PIECE_MODELS.goblin)).toBe(true);
    expect(bundledModelName(BUNDLED_PIECE_MODELS.goblin)).toBe('goblin');
    expect(isBundledModel('0'.repeat(64))).toBe(false);
    expect(bundledModelName('0'.repeat(64))).toBeNull();
  });
});

describe('bundled map models', () => {
  it('name each file blocks are drawn as by the SHA-256 of its bytes, and every such file bundled', () => {
    const files = readdirSync(join(ASSETS, 'models'), { withFileTypes: true })
      .filter((folder) => folder.isDirectory() && folder.name !== 'pieces')
      .flatMap((folder) =>
        readdirSync(join(ASSETS, 'models', folder.name))
          .filter((file) => file.endsWith('.glb'))
          .map((file) => join(ASSETS, 'models', folder.name, file))
      );
    const hashes = Object.fromEntries(
      files.map((file) => [
        file
          .split('/')
          .pop()!
          .replace(/\.glb$/, ''),
        createHash('sha256').update(readFileSync(file)).digest('hex'),
      ])
    );

    expect(hashes).toEqual(bundledMapModels());
  });

  it('know a map model by the bytes it was bundled with before as well, which a room saved then holds', () => {
    expect(isBundledMapModel('59e81a5a0dbf5933537ca0338160826fd1fbf75b4820fc70ac6d18015d9f23c3')).toBe(true);
    expect(isAppModel('59e81a5a0dbf5933537ca0338160826fd1fbf75b4820fc70ac6d18015d9f23c3')).toBe(true);
    expect(isAppModel(BUNDLED_PIECE_MODELS.goblin)).toBe(true);
    expect(isAppModel('0'.repeat(64))).toBe(false);
  });

  it('tell a map model by its identifier alone, whatever name it was added under', () => {
    expect(isBundledMapModel(bundledMapModels()['tree_oak'])).toBe(true);
    expect(isBundledMapModel(BUNDLED_PIECE_MODELS.goblin)).toBe(false);
    expect(isBundledMapModel('0'.repeat(64))).toBe(false);
  });
});
