import { AS_MADE } from '@axe/domain/tabletop/model-look';
import { drawnPicturesOf, madeMaterialOf, sceneMaterialFor } from '@axe/infrastructure/table-3d/model-materials';
import {
  MeshBasicMaterial,
  MeshLambertNodeMaterial,
  MeshStandardMaterial,
  MeshStandardNodeMaterial,
  MeshToonNodeMaterial,
  Texture,
} from 'three/webgpu';

describe('madeMaterialOf', () => {
  it('keeps what a material was made of, told by its name or by where it stands among the model’s', () => {
    const picture = new Texture();
    const bumps = new Texture();
    const armour = new MeshStandardMaterial({ color: '#336699', map: picture, normalMap: bumps, metalness: 0.9 });
    armour.name = 'Armour';

    const made = madeMaterialOf(armour, 3);

    expect(made).toMatchObject({ key: 'Armour', map: picture, normalMap: bumps, metalness: 0.9, roughness: 1 });
    expect(made.color.getHexString()).toBe('336699');
    expect(made.pictures).toEqual([picture, bumps]);
    expect(madeMaterialOf(new MeshStandardMaterial(), 3).key).toBe('#3');
  });

  it('takes a material made unlit as one of no metal, rough all over', () => {
    expect(madeMaterialOf(new MeshBasicMaterial({ color: '#ff0000' }), 0)).toMatchObject({
      metalness: 0,
      roughness: 1,
      emissiveIntensity: 1,
    });
  });
});

describe('drawnPicturesOf', () => {
  const [colour, bumps, shine, glow] = [new Texture(), new Texture(), new Texture(), new Texture()];
  const made = madeMaterialOf(
    new MeshStandardMaterial({
      map: colour,
      normalMap: bumps,
      metalnessMap: shine,
      roughnessMap: shine,
      emissive: '#ff2bd6',
      emissiveMap: glow,
    }),
    0
  );

  it('draws the colour alone at plain detail, and the bumps and the shine as well at full', () => {
    expect(drawnPicturesOf(made, 'plain', false)).toEqual([colour]);
    expect(drawnPicturesOf(made, 'full', false)).toEqual([colour, bumps, shine, shine]);
  });

  it('draws the picture of a glow only where the glow is kept', () => {
    expect(drawnPicturesOf(made, 'plain', true)).toEqual([colour, glow]);
    const glowless = madeMaterialOf(new MeshStandardMaterial({ map: colour, emissiveMap: glow }), 0);
    expect(drawnPicturesOf(glowless, 'plain', true)).toEqual([colour]);
  });
});

describe('sceneMaterialFor', () => {
  const picture = new Texture();
  const bumps = new Texture();
  const shine = new Texture();
  const armour = () =>
    madeMaterialOf(
      new MeshStandardMaterial({
        color: '#808080',
        map: picture,
        normalMap: bumps,
        metalnessMap: shine,
        roughnessMap: shine,
        metalness: 0.8,
        roughness: 0.4,
      }),
      0
    );

  it('keeps the metal, the roughness and the bumps of a model drawn as it was made at full detail', () => {
    const material = sceneMaterialFor(armour(), AS_MADE, '', 'full', false);

    expect(material).toBeInstanceOf(MeshStandardNodeMaterial);
    expect(material).toMatchObject({
      map: picture,
      normalMap: bumps,
      metalnessMap: shine,
      roughnessMap: shine,
      metalness: 0.8,
      roughness: 0.4,
    });
  });

  it('lights it evenly at plain detail and where it is drawn matt, with its colour and picture alone', () => {
    for (const material of [
      sceneMaterialFor(armour(), AS_MADE, '', 'plain', false),
      sceneMaterialFor(armour(), AS_MADE, 'matte', 'full', false),
    ]) {
      expect(material).toBeInstanceOf(MeshLambertNodeMaterial);
      expect(material.map).toBe(picture);
      expect((material as MeshLambertNodeMaterial).normalMap).toBeNull();
    }
  });

  it('shades a figure in flat bands, with its bumps at full detail alone', () => {
    const full = sceneMaterialFor(armour(), AS_MADE, 'toon', 'full', false);
    const plain = sceneMaterialFor(armour(), AS_MADE, 'toon', 'plain', false);

    expect(full).toBeInstanceOf(MeshToonNodeMaterial);
    expect((full as MeshToonNodeMaterial).normalMap).toBe(bumps);
    expect(plain).toBeInstanceOf(MeshToonNodeMaterial);
    expect((plain as MeshToonNodeMaterial).normalMap).toBeNull();
  });

  it('tints its own colour, or takes the tint alone and no picture where it is drawn plain', () => {
    const tinted = sceneMaterialFor(armour(), { ...AS_MADE, tint: '#ff0000' }, '', 'full', false);
    const plain = sceneMaterialFor(armour(), { ...AS_MADE, tint: '#ff0000', plain: true }, '', 'full', false);
    const bare = sceneMaterialFor(armour(), { ...AS_MADE, plain: true }, '', 'full', false);

    expect(tinted.color.getHexString()).toBe('800000');
    expect(tinted.map).toBe(picture);
    expect(plain.color.getHexString()).toBe('ff0000');
    expect(plain.map).toBeNull();
    expect((plain as MeshStandardNodeMaterial).metalnessMap).toBeNull();
    expect((plain as MeshStandardNodeMaterial).normalMap).toBe(bumps);
    expect(bare.color.getHexString()).toBe('808080');
  });

  it('takes the metal and the roughness its piece sets in place of the model’s own and their pictures', () => {
    const set = sceneMaterialFor(armour(), { ...AS_MADE, metalness: 0, roughness: 1 }, '', 'full', false);

    expect(set).toMatchObject({ metalness: 0, roughness: 1, metalnessMap: null, roughnessMap: null });
  });

  it('lets light through as far as its piece sets, on top of how far it was made to', () => {
    const made = madeMaterialOf(new MeshStandardMaterial({ transparent: true, opacity: 0.8 }), 0);

    expect(sceneMaterialFor(made, { ...AS_MADE, opacity: 0.5 }, '', 'full', false)).toMatchObject({
      transparent: true,
      opacity: 0.4,
    });
    expect(sceneMaterialFor(armour(), { ...AS_MADE, opacity: 0.5 }, '', 'full', false)).toMatchObject({
      transparent: true,
      opacity: 0.5,
    });
    expect(sceneMaterialFor(armour(), AS_MADE, '', 'full', false).transparent).toBe(false);
  });

  it('leaves a material its piece has left undrawn out, and names each by its key', () => {
    expect(sceneMaterialFor(armour(), { ...AS_MADE, hidden: true }, '', 'full', false).visible).toBe(false);
    expect(sceneMaterialFor(armour(), AS_MADE, '', 'full', false)).toMatchObject({ visible: true, name: '#0' });
  });

  describe('with a material made to glow', () => {
    const glowPicture = new Texture();
    const neon = () =>
      madeMaterialOf(
        new MeshStandardMaterial({ emissive: '#ff2bd6', emissiveMap: glowPicture, emissiveIntensity: 3 }),
        0
      );

    it('keeps the glow of one of the app’s own, as strong as it was made, with the picture it glows in', () => {
      for (const detail of ['full', 'plain'] as const) {
        const material = sceneMaterialFor(neon(), AS_MADE, '', detail, true);
        expect(material.emissive.getHexString()).toBe('ff2bd6');
        expect(material.emissiveMap).toBe(glowPicture);
        expect(material.emissiveIntensity).toBe(3);
      }
    });

    it('draws a model brought in without the glow it was made with, lest it stand out of the dark', () => {
      const material = sceneMaterialFor(neon(), AS_MADE, '', 'full', false);

      expect(material.emissive.getHex()).toBe(0);
      expect(material.emissiveMap).toBeNull();
    });

    it('gives off the glow its piece sets, whichever the model, in that colour alone', () => {
      const look = { ...AS_MADE, glow: '#00ff00', glowStrength: 2 };
      for (const ownGlow of [true, false]) {
        const material = sceneMaterialFor(neon(), look, '', 'full', ownGlow);
        expect(material.emissive.getHexString()).toBe('00ff00');
        expect(material.emissiveMap).toBeNull();
        expect(material.emissiveIntensity).toBe(2);
      }
    });

    it('sets how strong a glow kept is given off, where its piece sets only that', () => {
      const material = sceneMaterialFor(neon(), { ...AS_MADE, glowStrength: 0.5 }, '', 'full', true);

      expect(material.emissive.getHexString()).toBe('ff2bd6');
      expect(material.emissiveIntensity).toBe(0.5);
    });
  });
});
