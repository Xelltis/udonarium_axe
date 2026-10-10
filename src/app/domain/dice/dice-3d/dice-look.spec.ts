import {
  asDiceLook,
  decodeDiceLook,
  DiceLook,
  encodeDiceLook,
  isPlainDiceLook,
  PLAIN_DICE_LOOK,
  wornDiceLook,
} from '@axe/domain/dice/dice-3d/dice-look';

describe('dice look', () => {
  it('writes nothing for the plain look, which a line has no need to carry', () => {
    expect(encodeDiceLook(PLAIN_DICE_LOOK)).toBe('');
    expect(isPlainDiceLook(PLAIN_DICE_LOOK)).toBe(true);
  });

  it('reads back what it writes', () => {
    const looks: DiceLook[] = [
      { ...PLAIN_DICE_LOOK, material: 'marble' },
      { ...PLAIN_DICE_LOOK, body: '#1e6b52' },
      { ...PLAIN_DICE_LOOK, material: 'metal', body: '#b08d57', ink: '#1a1a1a' },
      { ...PLAIN_DICE_LOOK, material: 'glass', body: '#3b5bdb', ink: '#f6f3ec' },
    ];

    for (const look of looks) expect(decodeDiceLook(encodeDiceLook(look))).toEqual(look);
  });

  it('writes only what differs from the plain look', () => {
    expect(JSON.parse(encodeDiceLook({ ...PLAIN_DICE_LOOK, body: '#1e6b52' }))).toEqual({
      material: 'resin',
      body: '#1e6b52',
    });
  });

  describe('a line said before looks were offered, or by another version', () => {
    it('reads nothing at all as the plain look, never as some material', () => {
      expect(decodeDiceLook('')).toEqual(PLAIN_DICE_LOOK);
      expect(decodeDiceLook(undefined)).toEqual(PLAIN_DICE_LOOK);
      expect(decodeDiceLook(null)).toEqual(PLAIN_DICE_LOOK);
    });

    it('reads what it cannot make sense of as the plain look', () => {
      expect(decodeDiceLook('{not json')).toEqual(PLAIN_DICE_LOOK);
      expect(decodeDiceLook('"marble"')).toEqual(PLAIN_DICE_LOOK);
      expect(decodeDiceLook('[1,2]')).toEqual(PLAIN_DICE_LOOK);
    });

    it('reads a material it does not know as resin, keeping the colours', () => {
      expect(decodeDiceLook('{"material":"bone","body":"#aabbcc","sparkle":true}')).toEqual({
        ...PLAIN_DICE_LOOK,
        body: '#aabbcc',
      });
    });

    it('leaves a colour that is not one to the default', () => {
      expect(asDiceLook({ material: 'metal', body: 'red', ink: '#12345' })).toEqual({
        ...PLAIN_DICE_LOOK,
        material: 'metal',
      });
      expect(asDiceLook({ material: 'glass', body: ' #AABBCC ' }).body).toBe('#aabbcc');
    });
  });

  describe('with a picture', () => {
    const PICTURE = 'ab'.repeat(32);

    it('carries the picture beside the look rather than in it, so the room keeps it when saved', () => {
      const look: DiceLook = { ...PLAIN_DICE_LOOK, body: '#1e6b52', picture: PICTURE, pictureFit: 'faces' };

      const written = encodeDiceLook(look);

      expect(written).not.toContain(PICTURE);
      expect(decodeDiceLook(written, PICTURE)).toEqual(look);
    });

    it('writes nothing for a picture wrapped round plain dice, the line carrying the picture alone', () => {
      const look: DiceLook = { ...PLAIN_DICE_LOOK, picture: PICTURE };

      expect(isPlainDiceLook(look)).toBe(false);
      expect(encodeDiceLook(look)).toBe('');
      expect(decodeDiceLook('', PICTURE)).toEqual(look);
    });

    it('makes a die with a picture resin, whatever material it was asked to be', () => {
      expect(wornDiceLook({ ...PLAIN_DICE_LOOK, material: 'marble', picture: PICTURE }).material).toBe('resin');
      expect(decodeDiceLook('{"material":"glass"}', PICTURE).material).toBe('resin');
    });

    it('keeps the material chosen under a picture, for dice drawn without it', () => {
      const look: DiceLook = { ...PLAIN_DICE_LOOK, material: 'metal', picture: PICTURE };

      expect(asDiceLook(look).material).toBe('metal');
      expect(decodeDiceLook(encodeDiceLook(look), '').material).toBe('metal');
      expect(decodeDiceLook(encodeDiceLook(look), PICTURE).material).toBe('resin');
    });

    it('reads a picture that is not one an image is known by as none', () => {
      expect(decodeDiceLook('{"material":"metal"}', 'not-a-hash')).toEqual({ ...PLAIN_DICE_LOOK, material: 'metal' });
      expect(decodeDiceLook('', '')).toEqual(PLAIN_DICE_LOOK);
    });

    it('wraps a picture round the dice where the line says nothing of how, as a line from before the choice was offered', () => {
      expect(decodeDiceLook('{"material":"resin","pictureFit":"sideways"}', PICTURE).pictureFit).toBe('wrap');
    });
  });
});
