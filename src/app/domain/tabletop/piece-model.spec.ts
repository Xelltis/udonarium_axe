import { GameCharacter } from '@axe/domain/character/game-character';
import { writeModelFace } from '@axe/domain/tabletop/model-face';
import { presetModelLook, writeModelLook } from '@axe/domain/tabletop/model-look';
import { MODEL_MOTIONS_AS_MADE, writeModelMotions } from '@axe/domain/tabletop/model-motions';
import { modelScaleOf, modelTurnOf, PIECE_MODEL_AS_MADE, pieceModelOf } from '@axe/domain/tabletop/piece-model';
import { Terrain } from '@axe/domain/tabletop/terrain';

describe('the 3D model a piece is drawn as', () => {
  function fields(
    values: Partial<
      Record<
        | 'modelIdentifier'
        | 'modelScale'
        | 'modelTurn'
        | 'modelIdle'
        | 'modelWalk'
        | 'modelLook'
        | 'modelMotions'
        | 'modelFace',
        unknown
      >
    >
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
      ...PIECE_MODEL_AS_MADE,
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

  it('reads how its materials are drawn, its motions in a fight and its shapes from what was stored', () => {
    const model = pieceModelOf(
      fields({
        modelIdentifier: 'knight',
        modelLook: writeModelLook(presetModelLook('steel')),
        modelMotions: writeModelMotions({ ...MODEL_MOTIONS_AS_MADE, attack: 'Slash', made: false }),
        modelFace: writeModelFace({ blink: '-', mouth: '', breath: '', weights: { Joy: 0.5 }, sways: [] }),
      })
    );

    expect(model?.look).toMatchObject({ metalness: 1, roughness: 0.28, finish: '' });
    expect(model?.motions).toMatchObject({ attack: 'Slash', made: false });
    expect(model?.face).toMatchObject({ blink: '-', weights: { Joy: 0.5 } });
  });

  it('draws the model as it was made where the three later fields come empty, missing or unreadable', () => {
    for (const value of ['', undefined, null, 'not json', '[]', '{"finish":']) {
      const model = pieceModelOf(
        fields({ modelIdentifier: 'knight', modelLook: value, modelMotions: value, modelFace: value })
      );
      expect(model).toMatchObject(PIECE_MODEL_AS_MADE);
    }
  });

  it('keeps the look in the room data, and draws the model as made where an older peer sends the piece without it', () => {
    const piece = new GameCharacter();
    piece.initialize();
    piece.modelIdentifier = 'knight';
    piece.modelLook = writeModelLook(presetModelLook('gold'));
    expect(piece.toXml()).toContain('modelLook=');

    const older = piece.toContext();
    for (const name of ['modelLook', 'modelMotions', 'modelFace']) delete attributesOf(older)[name];
    older.majorVersion += 1;
    piece.apply(older);

    expect(pieceModelOf(piece)).toMatchObject({ identifier: 'knight', ...PIECE_MODEL_AS_MADE });
    piece.destroy();
  });

  it('reads a block’s look as a piece’s is read', () => {
    const block = new Terrain();
    block.initialize();
    block.modelIdentifier = 'statue';
    block.modelLook = writeModelLook(presetModelLook('stone'));

    expect(pieceModelOf(block)?.look).toMatchObject({ plain: true, roughness: 0.95 });
    block.destroy();
  });
});
