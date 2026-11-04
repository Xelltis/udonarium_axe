import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  BUNDLED_PIECE_MODELS,
  bundledModelName,
  bundledModelUrl,
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
        join(ASSETS, bundledModelUrl(name as keyof typeof BUNDLED_PIECE_MODELS).replace(/^assets\//, ''))
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
