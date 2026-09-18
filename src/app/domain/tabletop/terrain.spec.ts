import { TestBed } from '@angular/core/testing';
import { ImageFile } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { DoorStyle, Terrain, TerrainViewState } from '@axe/domain/tabletop/terrain';
import { SlopeDirection } from '@axe/domain/tabletop/terrain-slope';

describe('Terrain', () => {
  let store: ObjectStore;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    store = ObjectStore.instance;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('TerrainViewState enum', () => {
    it('NULL = 0', () => {
      expect(TerrainViewState.NULL).toBe(0);
    });

    it('FLOOR = 1', () => {
      expect(TerrainViewState.FLOOR).toBe(1);
    });

    it('WALL = 2', () => {
      expect(TerrainViewState.WALL).toBe(2);
    });

    it('ALL = 3', () => {
      expect(TerrainViewState.ALL).toBe(3);
    });
  });

  describe('SlopeDirection enum', () => {
    it('NONE = 0', () => {
      expect(SlopeDirection.NONE).toBe(0);
    });

    it('TOP = 1', () => {
      expect(SlopeDirection.TOP).toBe(1);
    });

    it('BOTTOM = 2', () => {
      expect(SlopeDirection.BOTTOM).toBe(2);
    });

    it('LEFT = 3', () => {
      expect(SlopeDirection.LEFT).toBe(3);
    });

    it('RIGHT = 4', () => {
      expect(SlopeDirection.RIGHT).toBe(4);
    });
  });

  describe('create()', () => {
    it('takes its name', () => {
      const terrain = Terrain.create('山岳', 2, 3, 1, 'wall.png', 'floor.png');
      expect(terrain.name).toBe('山岳');
    });

    it('takes its width, depth and height', () => {
      const terrain = Terrain.create('平原', 3, 4, 2, '', '');
      expect(terrain.width).toBe(3);
      expect(terrain.depth).toBe(4);
      expect(terrain.height).toBe(2);
    });

    it('is added to the store', () => {
      const terrain = Terrain.create('森', 1, 1, 1, '', '');
      const found = store.get(terrain.identifier);
      expect(found).toBe(terrain);
    });

    it('takes an identifier of its own', () => {
      const terrain = Terrain.create('川', 2, 2, 0, '', '', 'custom-terrain-id');
      expect(terrain.identifier).toBe('custom-terrain-id');
    });

    it('makes one when none is given', () => {
      const terrain = Terrain.create('道', 1, 1, 0, '', '');
      expect(terrain.identifier).toBeTruthy();
      expect(terrain.identifier.length).toBeGreaterThan(0);
    });

    it('builds a root element', () => {
      const terrain = Terrain.create('砂漠', 2, 2, 1, '', '');
      expect(terrain.rootDataElement).toBeTruthy();
    });

    it('builds a common element', () => {
      const terrain = Terrain.create('沼', 1, 1, 0, '', '');
      expect(terrain.commonDataElement).toBeTruthy();
    });

    it('builds an image element', () => {
      const terrain = Terrain.create('丘', 1, 1, 1, '', '');
      expect(terrain.imageDataElement).toBeTruthy();
    });
  });

  describe('aliasName', () => {
    it('names itself terrain', () => {
      const terrain = Terrain.create('test', 1, 1, 1, '', '');
      expect(terrain.aliasName).toBe('terrain');
    });
  });

  describe('the defaults of the synchronised fields', () => {
    it('starts unlocked', () => {
      const terrain = Terrain.create('t', 1, 1, 1, '', '');
      expect(terrain.isLocked).toBe(false);
    });

    it('starts showing everything', () => {
      const terrain = Terrain.create('t', 1, 1, 1, '', '');
      expect(terrain.mode).toBe(TerrainViewState.ALL);
    });

    it('starts unturned', () => {
      const terrain = Terrain.create('t', 1, 1, 1, '', '');
      expect(terrain.rotate).toBe(0);
    });

    it('starts casting a shadow', () => {
      const terrain = Terrain.create('t', 1, 1, 1, '', '');
      expect(terrain.isDropShadow).toBe(true);
    });

    it('starts unsloped', () => {
      const terrain = Terrain.create('t', 1, 1, 1, '', '');
      expect(terrain.isSlope).toBe(false);
    });

    it('starts with the surfaces shaded', () => {
      const terrain = Terrain.create('t', 1, 1, 1, '', '');
      expect(terrain.isSurfaceShading).toBe(true);
    });

    it('starts sloping nowhere', () => {
      const terrain = Terrain.create('t', 1, 1, 1, '', '');
      expect(terrain.slopeDirection).toBe(SlopeDirection.NONE);
    });

    it('starts without a grid', () => {
      const terrain = Terrain.create('t', 1, 1, 1, '', '');
      expect(terrain.isGrid).toBe(false);
    });

    it('starts with a stretched texture, as existing tables look', () => {
      const terrain = Terrain.create('t', 1, 1, 1, '', '');
      expect(terrain.isTiledTexture).toBe(false);
    });

    it('is not a door until it is told to be one', () => {
      const terrain = Terrain.create('t', 1, 1, 1, '', '');

      expect(terrain.doorStyle).toBe(DoorStyle.NONE);
      expect(terrain.isDoor).toBe(false);
      expect(terrain.isDoorOpen).toBe(false);
    });

    it('lets sight and light past while it stands open, without forgetting it stops them shut', () => {
      const terrain = Terrain.create('t', 1, 1, 1, '', '');
      terrain.doorStyle = DoorStyle.SWING;

      expect(terrain.blocksSightNow).toBe(true);
      expect(terrain.blocksLightNow).toBe(true);

      terrain.isDoorOpen = true;
      expect(terrain.blocksSightNow).toBe(false);
      expect(terrain.blocksLightNow).toBe(false);
      // The standing setting is untouched, so shutting it again puts the wall back.
      expect(terrain.blocksSight).toBe(true);

      terrain.isDoorOpen = false;
      expect(terrain.blocksSightNow).toBe(true);
    });

    it('does not open a wall that was never a door', () => {
      const terrain = Terrain.create('t', 1, 1, 1, '', '');
      terrain.isDoorOpen = true;

      expect(terrain.blocksSightNow).toBe(true);
    });

    it('stops blocking nothing when it never blocked anything', () => {
      const terrain = Terrain.create('t', 1, 1, 1, '', '');
      terrain.blocksSight = false;
      terrain.doorStyle = DoorStyle.LIFT;
      terrain.isDoorOpen = true;

      expect(terrain.blocksSightNow).toBe(false);
    });

    it('starts blocking both sight and light, as existing tables look', () => {
      const terrain = Terrain.create('t', 1, 1, 1, '', '');
      expect(terrain.blocksSight).toBe(true);
      expect(terrain.blocksLight).toBe(true);
    });

    it('a window blocks sight while letting the light through', () => {
      const terrain = Terrain.create('窓', 1, 1, 1, '', '');
      terrain.blocksLight = false;
      expect(terrain.blocksSight).toBe(true);
      expect(terrain.blocksLight).toBe(false);
    });

    it('starts unlit, and builds a light specification when asked', () => {
      const terrain = Terrain.create('結晶', 1, 1, 1, '', '');
      expect(terrain.lightEnabled).toBe(false);
      terrain.lightEnabled = true;
      terrain.lightBrightRadius = 3;
      terrain.lightDimRadius = 6;
      const spec = terrain.lightSpec;
      expect(spec.enabled).toBe(true);
      expect(spec.brightRadius).toBe(3);
      expect(spec.dimRadius).toBe(6);
      expect(spec.ignoreOcclusion).toBe(false);
    });

    it('turns a directed light with the terrain and adds its own direction', () => {
      const terrain = Terrain.create('灯台', 1, 1, 1, '', '');
      terrain.rotate = 90;
      terrain.lightDirection = 15;
      expect(terrain.lightSpec.direction).toBe(105);
      terrain.rotate = 200;
      expect(terrain.lightSpec.direction).toBe(215);
    });
  });

  describe('dimensions getter/setter', () => {
    it('takes a new width', () => {
      const terrain = Terrain.create('t', 1, 1, 1, '', '');
      terrain.width = 5;
      expect(terrain.width).toBe(5);
    });

    it('takes a new height', () => {
      const terrain = Terrain.create('t', 1, 1, 1, '', '');
      terrain.height = 3;
      expect(terrain.height).toBe(3);
    });

    it('takes a new depth', () => {
      const terrain = Terrain.create('t', 1, 1, 1, '', '');
      terrain.depth = 7;
      expect(terrain.depth).toBe(7);
    });

    it('takes a new name', () => {
      const terrain = Terrain.create('初期名', 1, 1, 1, '', '');
      terrain.name = '変更後';
      expect(terrain.name).toBe('変更後');
    });
  });

  describe('whether it has a wall and a floor', () => {
    it('mode=ALL → hasWall=true, hasFloor=true', () => {
      const terrain = Terrain.create('t', 1, 1, 1, '', '');
      terrain.mode = TerrainViewState.ALL;
      expect(terrain.hasWall).toBe(true);
      expect(terrain.hasFloor).toBe(true);
    });

    it('mode=WALL → hasWall=true, hasFloor=false', () => {
      const terrain = Terrain.create('t', 1, 1, 1, '', '');
      terrain.mode = TerrainViewState.WALL;
      expect(terrain.hasWall).toBe(true);
      expect(terrain.hasFloor).toBe(false);
    });

    it('mode=FLOOR → hasWall=false, hasFloor=true', () => {
      const terrain = Terrain.create('t', 1, 1, 1, '', '');
      terrain.mode = TerrainViewState.FLOOR;
      expect(terrain.hasWall).toBe(false);
      expect(terrain.hasFloor).toBe(true);
    });

    it('mode=NULL → hasWall=false, hasFloor=false', () => {
      const terrain = Terrain.create('t', 1, 1, 1, '', '');
      terrain.mode = TerrainViewState.NULL;
      expect(terrain.hasWall).toBe(false);
      expect(terrain.hasFloor).toBe(false);
    });
  });

  describe('what it inherits', () => {
    it('starts on the table', () => {
      const terrain = Terrain.create('t', 1, 1, 1, '', '');
      expect(terrain.location.name).toBe('table');
    });

    it('starts at ground level', () => {
      const terrain = Terrain.create('t', 1, 1, 1, '', '');
      expect(terrain.posZ).toBe(0);
    });

    it('can be seen on the table', () => {
      const terrain = Terrain.create('t', 1, 1, 1, '', '');
      expect(terrain.isVisibleOnTable).toBe(true);
    });

    it('takes a new place', () => {
      const terrain = Terrain.create('t', 1, 1, 1, '', '');
      terrain.setLocation('graveyard');
      expect(terrain.location.name).toBe('graveyard');
      expect(terrain.isVisibleOnTable).toBe(false);
    });
  });

  describe('the picture on each of the six faces', () => {
    beforeEach(() => {
      vi.spyOn(ImageStorage.instance, 'get').mockImplementation((id: string) =>
        id ? ({ identifier: id } as ImageFile) : null
      );
    });

    it('falls back to the floor picture for the top and the bottom', () => {
      const terrain = Terrain.create('t', 1, 1, 1, 'W', 'F');
      expect(terrain.topImage?.identifier).toBe('F');
      expect(terrain.bottomImage?.identifier).toBe('F');
    });

    it('falls back to the wall picture for the sides', () => {
      const terrain = Terrain.create('t', 1, 1, 1, 'W', 'F');
      expect(terrain.northImage?.identifier).toBe('W');
      expect(terrain.southImage?.identifier).toBe('W');
      expect(terrain.eastImage?.identifier).toBe('W');
      expect(terrain.westImage?.identifier).toBe('W');
    });

    it('sets one face and leaves the others to fall back', () => {
      const terrain = Terrain.create('t', 1, 1, 1, 'W', 'F');
      terrain.setFaceImage('top', 'T');
      expect(terrain.topImage?.identifier).toBe('T');
      expect(terrain.bottomImage?.identifier).toBe('F');
      expect(terrain.northImage?.identifier).toBe('W');
    });

    it('replaces a face that already has one', () => {
      const terrain = Terrain.create('t', 1, 1, 1, 'W', 'F');
      terrain.setFaceImage('east', 'E1');
      terrain.setFaceImage('east', 'E2');
      expect(terrain.eastImage?.identifier).toBe('E2');
    });

    it('starts sloping to no side', () => {
      const terrain = Terrain.create('t', 1, 1, 1, '', '');
      expect(terrain.slopeSides).toEqual([]);
    });

    it('agrees with each of the getters', () => {
      const terrain = Terrain.create('t', 1, 1, 1, 'W', 'F');
      terrain.setFaceImage('east', 'E');
      expect(terrain.faceImage('east')?.identifier).toBe('E');
      expect(terrain.faceImage('top')?.identifier).toBe('F');
      expect(terrain.faceImage('north')?.identifier).toBe('W');
    });
  });

  describe('the sides it slopes to', () => {
    function block(): Terrain {
      return Terrain.create('t', 2, 2, 1, '', '');
    }

    it('turns the slope on with the sides it is given', () => {
      const terrain = block();

      terrain.slopeSides = ['n', 'e'];

      expect(terrain.isSlope).toBe(true);
      expect(terrain.slopeSides).toEqual(['n', 'e']);
    });

    it('turns the slope off again when it is given none', () => {
      const terrain = block();
      terrain.slopeSides = ['n'];

      terrain.slopeSides = [];

      expect(terrain.isSlope).toBe(false);
      expect(terrain.slopeSides).toEqual([]);
    });

    it('leaves an older peer the one direction it knows', () => {
      const terrain = block();

      terrain.slopeSides = ['s', 'w'];

      expect(terrain.slopeDirection).toBe(SlopeDirection.BOTTOM);
    });

    it('reads a room saved before a block could slope to more than one side', () => {
      const terrain = block();
      terrain.isSlope = true;
      terrain.slopeDirection = SlopeDirection.LEFT;

      expect(terrain.slopeSides).toEqual(['w']);
    });

    it('reads a block whose slope is off as sloping to nothing, whatever it holds', () => {
      const terrain = block();
      terrain.slopeSides = ['n', 'e'];

      terrain.isSlope = false;

      expect(terrain.slopeSides).toEqual([]);
    });

    it('keeps the sides of a hex block an older peer has no direction for', () => {
      const terrain = block();

      terrain.slopeSides = ['ne', 'sw'];

      expect(terrain.slopeSides).toEqual(['ne', 'sw']);
      expect(terrain.slopeDirection).toBe(SlopeDirection.NONE);
      expect(terrain.isSlope).toBe(true);
    });
  });
});
