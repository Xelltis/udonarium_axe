import { TestBed } from '@angular/core/testing';
import { ObjectStore } from '@axe/core/sync/object-store';
import { browsableImageTags, canBrowseImage, ImageTag, SYSTEM_RESERVED_TAG } from '@axe/domain/media/image-tag';

describe('ImageTag', () => {
  let store: ObjectStore;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    store = ObjectStore.instance;
  });

  describe('create()', () => {
    it('is created against an image identifier', () => {
      const tag = ImageTag.create('img001');
      expect(tag).toBeTruthy();
      expect(tag.imageIdentifier).toBe('img001');
    });

    it('carries the image tag prefix in its identifier', () => {
      const tag = ImageTag.create('img001');
      expect(tag.identifier).toBe('imagetag_img001');
    });

    it('is added to the store', () => {
      const tag = ImageTag.create('img001');
      expect(store.get(tag.identifier)).toBe(tag);
    });
  });

  describe('get()', () => {
    it('looks a tag up by its image identifier', () => {
      ImageTag.create('img001');
      const found = ImageTag.get('img001');
      expect(found).toBeTruthy();
      expect(found!.imageIdentifier).toBe('img001');
    });

    it('returns nothing for an identifier that is not there', () => {
      expect(ImageTag.get('nonexistent')).toBeFalsy();
    });
  });

  describe('SyncVar', () => {
    it('starts untagged', () => {
      const tag = ImageTag.create('img001');
      expect(tag.tag).toBe('');
    });

    it('takes a tag', () => {
      const tag = ImageTag.create('img001');
      tag.tag = 'モンスター 森';
      expect(tag.tag).toBe('モンスター 森');
    });
  });

  describe('keeping a picture back', () => {
    it('keeps nothing back to begin with', () => {
      expect(ImageTag.create('img001').isSecret).toBe(false);
      expect(ImageTag.isSecret('img001')).toBe(false);
    });

    it('remembers what the master chose to keep', () => {
      ImageTag.create('img001').isSecret = true;

      expect(ImageTag.isSecret('img001')).toBe(true);
    });

    it('says nothing is kept back where there is no tag at all', () => {
      expect(ImageTag.isSecret('never-tagged')).toBe(false);
    });
  });

  describe('containsWords()', () => {
    it('is true when every word is there', () => {
      const tag = ImageTag.create('img001');
      tag.tag = 'モンスター 森 ボス';
      expect(tag.containsWords(['モンスター', '森'])).toBe(true);
    });

    it('is false when one is missing', () => {
      const tag = ImageTag.create('img001');
      tag.tag = 'モンスター 森';
      expect(tag.containsWords(['モンスター', '海'])).toBe(false);
    });

    it('is true for no words at all', () => {
      const tag = ImageTag.create('img001');
      tag.tag = 'anything';
      expect(tag.containsWords([])).toBe(true);
    });
  });
});

describe('canBrowseImage()', () => {
  /** A seat that sees what the master keeps back or not, kept from no tag. */
  const sees = (canSeeSecret: boolean) => ({ canSeeSecret, hidesTag: () => false });

  function tag(partial: { tag?: string; isSecret?: boolean }): ImageTag {
    return { tag: partial.tag ?? '', isSecret: partial.isSecret ?? false } as ImageTag;
  }

  it('shows a picture nobody has said anything about', () => {
    expect(canBrowseImage(null, sees(false))).toBe(true);
    expect(canBrowseImage(tag({}), sees(false))).toBe(true);
  });

  it('shows one a person has filed under a name of their own', () => {
    expect(canBrowseImage(tag({ tag: 'コマ' }), sees(false))).toBe(true);
  });

  it('never shows what the tool brought with it, master or not', () => {
    expect(canBrowseImage(tag({ tag: SYSTEM_RESERVED_TAG }), sees(false))).toBe(false);
    expect(canBrowseImage(tag({ tag: SYSTEM_RESERVED_TAG }), sees(true))).toBe(false);
  });

  it('keeps one the master has kept away from everyone else', () => {
    expect(canBrowseImage(tag({ isSecret: true }), sees(false))).toBe(false);
  });

  it('shows it to the master', () => {
    expect(canBrowseImage(tag({ isSecret: true }), sees(true))).toBe(true);
  });

  it('folds it away again when the master asks for that', () => {
    expect(canBrowseImage(tag({ isSecret: true }), sees(true), false)).toBe(false);
    // Folding them away is the master's own view; it lets nothing else through.
    expect(canBrowseImage(tag({ tag: 'コマ' }), sees(true), false)).toBe(true);
  });

  it('keeps one filed under a tag kept from whoever is looking, and only that tag', () => {
    const keptFromMe = (name: string) => name === 'ボス';

    expect(canBrowseImage(tag({ tag: 'ボス' }), { canSeeSecret: true, hidesTag: keptFromMe }, true)).toBe(false);
    expect(canBrowseImage(tag({ tag: 'コマ' }), { canSeeSecret: false, hidesTag: keptFromMe }, true)).toBe(true);
    expect(canBrowseImage(null, { canSeeSecret: false, hidesTag: keptFromMe }, true)).toBe(true);
  });
});

describe('browsableImageTags()', () => {
  const sees = (canSeeSecret: boolean, hidesTag = (_tag: string) => false) => ({ canSeeSecret, hidesTag });

  beforeEach(() => {
    TestBed.configureTestingModule({});
    const filed = (identifier: string, name: string, isSecret = false) => {
      const tag = ImageTag.create(identifier);
      tag.tag = name;
      tag.isSecret = isSecret;
    };
    filed('forest', '森');
    filed('boss', 'ボス', true);
    filed('boss-too', '森', true);
    filed('sample', SYSTEM_RESERVED_TAG);
    filed('locked', '宝');
  });

  afterEach(() => {
    for (const tag of ObjectStore.instance.getObjects<ImageTag>(ImageTag)) tag.destroy();
  });

  const images = ['forest', 'boss', 'boss-too', 'sample', 'locked', 'untagged'].map((identifier) => ({ identifier }));

  it('names no tag only the pictures the master keeps back carry, to anyone but the master', () => {
    expect(browsableImageTags(images, sees(false))).toEqual(['森', '宝']);
    expect(browsableImageTags(images, sees(true))).toEqual(['森', 'ボス', '宝']);
  });

  it('names none while the master has the kept pictures folded away', () => {
    expect(browsableImageTags(images, sees(true), false)).toEqual(['森', '宝']);
  });

  it('names no tag kept from whoever looks, nor the tool’s own', () => {
    expect(
      browsableImageTags(
        images,
        sees(true, (tag) => tag === '宝')
      )
    ).toEqual(['森', 'ボス']);
  });
});
