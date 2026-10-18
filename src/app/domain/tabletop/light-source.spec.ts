import { TestBed } from '@angular/core/testing';
import { ObjectSerializer } from '@axe/core/sync/object-serializer';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { LightSource } from '@axe/domain/tabletop/light-source';
import { LightAnimation, LightCategory, LightPreset } from '@axe/domain/tabletop/vision-types';

describe('LightSource', () => {
  let store: ObjectStore;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    store = ObjectStore.instance;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('create()', () => {
    it('takes a name and is added to the store', () => {
      const light = LightSource.create('松明');
      expect(light.name).toBe('松明');
      expect(store.get(light.identifier)).toBe(light);
    });

    it('names itself a light source', () => {
      const light = LightSource.create('test');
      expect(light.aliasName).toBe('light-source');
    });
  });

  describe('the defaults of the synchronised fields', () => {
    it('an ordinary lit source', () => {
      const light = LightSource.create('test');
      expect(light.lightEnabled).toBe(true);
      expect(light.lightPreset).toBe(LightPreset.CUSTOM);
      expect(light.lightBrightRadius).toBe(4);
      expect(light.lightDimRadius).toBe(8);
      expect(light.lightAngle).toBe(360);
      expect(light.lightAnimation).toBe(LightAnimation.NONE);
      expect(light.lightCategory).toBe(LightCategory.PHYSICAL);
      expect(light.lightIgnoreOcclusion).toBe(false);
      expect(light.lightRevealToAll).toBe(false);
      expect(light.lightCastShadows).toBe(true);
      expect(light.followingCharacterIdentifier).toBe('');
    });

    it('starts on the table, where it can be seen', () => {
      const light = LightSource.create('test');
      expect(light.location.name).toBe('table');
      expect(light.isVisibleOnTable).toBe(true);
    });
  });

  describe('lightSpec getter', () => {
    it('builds the specification from its fields', () => {
      const light = LightSource.create('test');
      light.lightBrightRadius = 2;
      light.lightDimRadius = 5;
      light.lightColor = '#abcdef';
      light.lightCategory = LightCategory.THEATRICAL;
      light.lightRevealToAll = true;
      const spec = light.lightSpec;
      expect(spec.brightRadius).toBe(2);
      expect(spec.dimRadius).toBe(5);
      expect(spec.color).toBe('#abcdef');
      expect(spec.category).toBe(LightCategory.THEATRICAL);
      expect(spec.revealToAll).toBe(true);
    });
  });

  describe('following()', () => {
    it('moves the light to the centre of the character it follows', () => {
      const character = GameCharacter.create('対象', 2, '');
      character.location.x = 100;
      character.location.y = 200;
      const light = LightSource.create('追従光');
      light.followingCharacterIdentifier = character.identifier;

      light.following(80);

      expect(light.location.x).toBe(100 + (80 * 2) / 2);
      expect(light.location.y).toBe(200 + (80 * 2) / 2);
    });

    it('stops following a character that is not there', () => {
      const light = LightSource.create('test');
      light.followingCharacterIdentifier = 'missing-id';
      light.following(50);
      expect(light.followingCharacterIdentifier).toBe('');
    });
  });

  describe('restoring from xml', () => {
    it('reads the saved fields back into their own types', () => {
      const xml = `<light-source owner="" isLock="false" lightEnabled="true" lightPreset="spotlight" lightBrightRadius="7" lightDimRadius="11" lightColor="#ff8800" lightAngle="30" lightAnimation="pulse" lightCategory="theatrical" lightIgnoreOcclusion="true" lightRevealToAll="true" lightCastShadows="true">
        <data name="light-source"><data name="common"><data name="name">保存光</data></data></data>
        </light-source>`;

      const restored = ObjectSerializer.instance.parseXml(xml) as LightSource;

      expect(restored).toBeInstanceOf(LightSource);
      expect(restored.name).toBe('保存光');
      expect(restored.lightPreset).toBe(LightPreset.SPOTLIGHT);
      expect(restored.lightBrightRadius).toBe(7);
      expect(restored.lightDimRadius).toBe(11);
      expect(restored.lightColor).toBe('#ff8800');
      expect(restored.lightAngle).toBe(30);
      expect(restored.lightAnimation).toBe(LightAnimation.PULSE);
      expect(restored.lightCategory).toBe(LightCategory.THEATRICAL);
      expect(restored.lightIgnoreOcclusion).toBe(true);
      expect(restored.lightRevealToAll).toBe(true);
      expect(restored.lightCastShadows).toBe(true);
    });
  });
});
