import { TestBed } from '@angular/core/testing';
import { ImageFile } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectSerializer } from '@axe/core/sync/object-serializer';
import { ObjectStore } from '@axe/core/sync/object-store';
import { DataElement } from '@axe/domain/data/data-element';
import { GameTableMask } from '@axe/domain/tabletop/game-table-mask';

describe('GameTableMask', () => {
  let store: ObjectStore;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    store = ObjectStore.instance;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('create()', () => {
    it('is created with a name and a size', () => {
      const mask = GameTableMask.create('テストマスク', 3, 4, 100);
      expect(mask).toBeTruthy();
      expect(mask.name).toBe('テストマスク');
      expect(mask.width).toBe(3);
      expect(mask.height).toBe(4);
    });

    it('is created against an identifier of its own', () => {
      const mask = GameTableMask.create('mask', 1, 1, 100, 'mask-id');
      expect(mask.identifier).toBe('mask-id');
    });

    it('is added to the store', () => {
      const mask = GameTableMask.create('mask', 1, 1, 100);
      expect(store.get(mask.identifier)).toBe(mask);
    });
  });

  describe('aliasName', () => {
    it('names itself a mask', () => {
      const mask = GameTableMask.create('test', 1, 1, 100);
      expect(mask.aliasName).toBe('table-mask');
    });
  });

  describe('the defaults of the synchronised fields', () => {
    it('starts unlocked', () => {
      const mask = GameTableMask.create('test', 1, 1, 100);
      expect(mask.isLock).toBe(false);
    });

    it('starts unowned', () => {
      const mask = GameTableMask.create('test', 1, 1, 100);
      expect(mask.owner).toBe('');
    });

    it('starts showing the lock mark', () => {
      const mask = GameTableMask.create('test', 1, 1, 100);
      expect(mask.dispLockMark).toBe(true);
    });

    it('starts out of preview', () => {
      const mask = GameTableMask.create('test', 1, 1, 100);
      expect(mask.isPreview).toBe(false);
    });
  });

  describe('hasOwner', () => {
    it('is false while it is unowned', () => {
      const mask = GameTableMask.create('test', 1, 1, 100);
      expect(mask.hasOwner).toBe(false);
    });

    it('is true once it has an owner', () => {
      const mask = GameTableMask.create('test', 1, 1, 100);
      mask.owner = 'user-1';
      expect(mask.hasOwner).toBe(true);
    });
  });

  describe('ownerColor', () => {
    it('returns its own colour', () => {
      const mask = GameTableMask.create('test', 1, 1, 100);
      expect(mask.ownerColor).toBe('#444444');
    });
  });

  describe('color', () => {
    it('falls back to a default colour when it carries none', () => {
      const mask = GameTableMask.create('test', 1, 1, 100);
      expect(mask.color).toBe('#555555');
    });

    it('returns the colour it carries', () => {
      const mask = GameTableMask.create('test', 1, 1, 100);
      mask.commonDataElement!.appendChild(
        DataElement.create('color', '#FF0000', { type: 'colors', currentValue: '#0a0a0a' }, 'color_' + mask.identifier)
      );
      expect(mask.color).toBe('#FF0000');
    });

    it('takes a new colour', () => {
      const mask = GameTableMask.create('test', 1, 1, 100);
      mask.commonDataElement!.appendChild(
        DataElement.create('color', '#555555', { type: 'colors', currentValue: '#0a0a0a' }, 'color_' + mask.identifier)
      );
      mask.color = '#00FF00';
      expect(mask.color).toBe('#00FF00');
    });

    it('falls back to a default background when it carries none', () => {
      const mask = GameTableMask.create('test', 1, 1, 100);
      expect(mask.bgcolor).toBe('#0a0a0a');
    });
  });

  describe('what it inherits', () => {
    it('starts on the table', () => {
      const mask = GameTableMask.create('test', 1, 1, 100);
      expect(mask.location.name).toBe('table');
    });
  });

  describe('its size', () => {
    it('takes a new width and height', () => {
      const mask = GameTableMask.create('test', 1, 1, 100);
      mask.width = 4;
      mask.height = 6;
      expect(mask.width).toBe(4);
      expect(mask.height).toBe(6);
    });
  });

  describe('paintColor', () => {
    it('adds the colour element a mask made from the menu lacks, holding the colour twice', () => {
      const mask = GameTableMask.create('test', 1, 1, 100);
      expect(mask.commonDataElement!.getFirstElementByName('color')).toBeNull();

      mask.paintColor('#336699');

      const element = mask.commonDataElement!.getFirstElementByName('color')!;
      expect(element.identifier).toBe(`color_${mask.identifier}`);
      expect(element.getAttribute('type')).toBe('colors');
      expect(mask.color).toBe('#336699');
      expect(mask.bgcolor).toBe('#336699');
    });

    it('writes both values onto the colour element it already has, adding no other', () => {
      const mask = GameTableMask.create('test', 1, 1, 100);
      mask.commonDataElement!.appendChild(
        DataElement.create('color', '#555555', { type: 'colors', currentValue: '#0a0a0a' }, 'color_' + mask.identifier)
      );

      mask.paintColor('#abcdef');

      expect(mask.commonDataElement!.getElementsByName('color')).toHaveLength(1);
      expect(mask.color).toBe('#abcdef');
      expect(mask.bgcolor).toBe('#abcdef');
    });
  });

  describe('the look after scratching', () => {
    afterEach(() => {
      ImageStorage.instance.images.forEach((image) => ImageStorage.instance.delete(image.identifier));
    });

    it('has neither a colour nor a picture on a mask from an older room', () => {
      const mask = GameTableMask.create('test', 1, 1, 100);

      expect(mask.scratchedColor).toBe('');
      expect(mask.scratchedImageIdentifier).toBe('');
      expect(mask.scratchedImageFile).toBe(ImageFile.Empty);
      expect(mask.commonDataElement!.getFirstElementByName('scratchedColor')).toBeNull();
      expect(mask.commonDataElement!.getFirstElementByName('scratchedImageIdentifier')).toBeNull();
    });

    it('reads an empty or blank value as none', () => {
      const mask = GameTableMask.create('test', 1, 1, 100);
      mask.commonDataElement!.appendChild(DataElement.create('scratchedColor', '', { type: 'colors' }));
      mask.commonDataElement!.appendChild(DataElement.create('scratchedImageIdentifier', '  ', { type: 'image' }));

      expect(mask.scratchedColor).toBe('');
      expect(mask.scratchedImageIdentifier).toBe('');
      expect(mask.scratchedImageFile).toBe(ImageFile.Empty);
    });

    it('adds the colour element when a colour is first set, under a fixed identifier', () => {
      const mask = GameTableMask.create('test', 1, 1, 100);

      mask.scratchedColor = '#112233';

      const element = mask.commonDataElement!.getFirstElementByName('scratchedColor')!;
      expect(element.identifier).toBe(`scratchedColor_${mask.identifier}`);
      expect(element.getAttribute('type')).toBe('colors');
      expect(mask.scratchedColor).toBe('#112233');
    });

    it('adds the picture element beside the common values, typed as an image, leaving the own picture alone', () => {
      const mask = GameTableMask.create('test', 1, 1, 100);
      const image = ImageStorage.instance.add('./assets/images/after-scratch.png');

      mask.scratchedImageIdentifier = image.identifier;

      const element = mask.commonDataElement!.getFirstElementByName('scratchedImageIdentifier')!;
      expect(element.identifier).toBe(`scratchedImageIdentifier_${mask.identifier}`);
      expect(element.getAttribute('type')).toBe('image');
      expect(element.parent).toBe(mask.commonDataElement);
      expect(mask.imageDataElement!.children.map((child) => child.getAttribute('name'))).toEqual(['imageIdentifier']);
      expect(mask.scratchedImageFile).toBe(image);
      expect(mask.imageFile).toBe(ImageFile.Empty);
    });

    it('adds nothing when set to none on a mask without the elements', () => {
      const mask = GameTableMask.create('test', 1, 1, 100);

      mask.scratchedColor = '';
      mask.scratchedImageIdentifier = '';

      expect(mask.commonDataElement!.getFirstElementByName('scratchedColor')).toBeNull();
      expect(mask.commonDataElement!.getFirstElementByName('scratchedImageIdentifier')).toBeNull();
    });

    it('writes over the element it already has, and clearing empties it rather than removing it', () => {
      const mask = GameTableMask.create('test', 1, 1, 100);
      mask.scratchedColor = '#112233';

      mask.scratchedColor = '#445566';
      expect(mask.scratchedColor).toBe('#445566');

      mask.scratchedColor = '';
      expect(mask.scratchedColor).toBe('');
      expect(mask.commonDataElement!.getElementsByName('scratchedColor')).toHaveLength(1);
    });
  });

  describe('an update from a peer that knows nothing of the look after scratching', () => {
    it('leaves the elements in place, since the mask and its common data do not list their children', () => {
      const mask = GameTableMask.create('test', 1, 1, 100);
      const common = mask.commonDataElement!;
      const maskBefore = mask.toContext();
      const commonBefore = common.toContext();
      mask.scratchedColor = '#112233';
      mask.scratchedImageIdentifier = 'image-1';

      mask.apply({ ...maskBefore, majorVersion: mask.majorVersion + 1 });
      common.apply({ ...commonBefore, majorVersion: common.majorVersion + 1 });

      expect(mask.scratchedColor).toBe('#112233');
      expect(mask.scratchedImageIdentifier).toBe('image-1');
    });
  });

  describe('a saved room', () => {
    /**
     * A saved mask carrying the look after scratching.
     *
     * Built by hand: the reader cannot take a written mask, because happy-dom refuses the dotted
     * attribute names such as `location.x` that one carries.
     */
    const SAVED_MASK =
      '<table-mask><data name="table-mask">' +
      '<data name="image"><data type="image" name="imageIdentifier"></data></data>' +
      '<data name="common"><data name="name">saved</data><data name="width">2</data><data name="height">2</data>' +
      '<data type="colors" name="scratchedColor">#112233</data>' +
      '<data type="image" name="scratchedImageIdentifier">image-1</data></data>' +
      '<data name="detail"></data></data></table-mask>';

    it('writes the look after scratching into the saved mask, the picture typed as an image', () => {
      const mask = GameTableMask.create('test', 1, 1, 100);
      mask.scratchedColor = '#112233';
      mask.scratchedImageIdentifier = 'image-1';

      const xml = mask.toXml();

      expect(xml).toMatch(/<data(?=[^>]*type="colors")(?=[^>]*name="scratchedColor")[^>]*>#112233<\/data>/);
      expect(xml).toMatch(/<data(?=[^>]*type="image")(?=[^>]*name="scratchedImageIdentifier")[^>]*>image-1<\/data>/);
    });

    it('reads it back from a saved mask', () => {
      const mask = ObjectSerializer.instance.parseXml(SAVED_MASK) as GameTableMask;

      expect(mask).toBeInstanceOf(GameTableMask);
      expect(mask.scratchedColor).toBe('#112233');
      expect(mask.scratchedImageIdentifier).toBe('image-1');

      mask.destroy();
    });
  });
});
