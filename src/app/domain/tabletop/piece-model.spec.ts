import { GameCharacter } from '@axe/domain/character/game-character';
import { modelScaleOf, modelTurnOf, pieceModelOf } from '@axe/domain/tabletop/piece-model';
import { Terrain } from '@axe/domain/tabletop/terrain';

describe('the 3D model a piece is drawn as', () => {
  function fields(
    values: Partial<Record<'modelIdentifier' | 'modelScale' | 'modelTurn' | 'modelIdle' | 'modelWalk', unknown>>
  ) {
    return { modelIdentifier: '', modelScale: '', modelTurn: '', modelIdle: '', modelWalk: '', ...values };
  }

  function attributesOf(context: ReturnType<GameCharacter['toContext']>): Record<string, unknown> {
    return context.syncData['attributes'] as Record<string, unknown>;
  }

  it('is none for a piece that names no model', () => {
    for (const identifier of ['', '  ', undefined, null])
      expect(pieceModelOf(fields({ modelIdentifier: identifier }))).toBeNull();
  });

  it('is the model named, at its footprint, unturned, with its own motions, where nothing else was set', () => {
    expect(pieceModelOf(fields({ modelIdentifier: 'tree' }))).toEqual({
      identifier: 'tree',
      scale: 1,
      turnDeg: 0,
      idle: '',
      walk: '',
    });
  });

  it('reads a size or a turn sent empty, or none at all, as the model’s own rather than as nought', () => {
    for (const value of ['', undefined, null, 'not a number', 0, -2]) expect(modelScaleOf(value)).toBe(1);
    for (const value of ['', undefined, null, 'not a number']) expect(modelTurnOf(value)).toBe(0);
    expect(modelScaleOf('2.5')).toBe(2.5);
    expect(modelScaleOf(1000)).toBe(10);
    expect(modelTurnOf('-90')).toBe(270);
    expect(modelTurnOf(450)).toBe(90);
  });

  it('is none on a piece or a block saved before there were models', () => {
    const piece = new GameCharacter();
    piece.initialize();
    const block = new Terrain();
    block.initialize();

    expect(pieceModelOf(piece)).toBeNull();
    expect(pieceModelOf(block)).toBeNull();
    piece.destroy();
    block.destroy();
  });

  it('goes into the room data, and back to the picture where an older peer sends the piece without it', () => {
    const piece = new GameCharacter();
    piece.initialize();
    piece.modelIdentifier = 'knight';
    piece.modelScale = '1.5';
    expect(piece.toXml()).toContain('modelIdentifier="knight"');

    const older = piece.toContext();
    for (const name of ['modelIdentifier', 'modelScale', 'modelTurn', 'modelIdle', 'modelWalk'])
      delete attributesOf(older)[name];
    older.majorVersion += 1;
    piece.apply(older);

    expect(pieceModelOf(piece)).toBeNull();
    piece.destroy();
  });
});
