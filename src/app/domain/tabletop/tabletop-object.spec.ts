import { TestBed } from '@angular/core/testing';
import { DataElement } from '@axe/domain/data/data-element';
import { boardSurfaceOf, surfaceOf, TabletopObject } from '@axe/domain/tabletop/tabletop-object';

describe('TabletopObject', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('the defaults of the synchronised fields', () => {
    it('where it starts', () => {
      const obj = new TabletopObject();
      obj.initialize();
      expect(obj.location).toEqual({ name: 'table', x: 0, y: 0 });
    });

    it('reads an unset surface as the floor', () => {
      const obj = new TabletopObject();
      obj.initialize();
      expect(surfaceOf(obj)).toBe('floor');
    });

    it('reads the surface it is given', () => {
      const obj = new TabletopObject();
      obj.initialize();
      obj.location.surface = 'north-wall';
      expect(surfaceOf(obj)).toBe('north-wall');
    });

    it('falls back to the floor for one it cannot read', () => {
      expect(surfaceOf({ location: { surface: '' as never } })).toBe('floor');
      expect(surfaceOf({ location: { surface: 'wall' as never } })).toBe('floor');
    });

    it('starts at ground level', () => {
      const obj = new TabletopObject();
      obj.initialize();
      expect(obj.posZ).toBe(0);
    });

    it('starts without the altitude shown', () => {
      const obj = new TabletopObject();
      obj.initialize();
      expect(obj.isAltitudeIndicate).toBe(false);
    });
  });

  describe('the face a piece says it stands on', () => {
    const standingOn = (surface?: string) => ({ location: { surface } });

    it('is the face it names', () => {
      expect(surfaceOf(standingOn('north-wall'))).toBe('north-wall');
      expect(boardSurfaceOf(standingOn('a-board'))).toBe('a-board');
    });

    it('is the floor where it names none', () => {
      expect(surfaceOf(standingOn(undefined))).toBe('floor');
      expect(boardSurfaceOf(standingOn(undefined))).toBe('');
    });

    it('is the floor where it names nothing in words', () => {
      // A face cleared by one seat reaches another as nothing and can be written back out as
      // the word for it. Read as a name, the piece stands on a board nobody has.
      for (const word of ['null', 'undefined', '']) {
        expect(surfaceOf(standingOn(word))).toBe('floor');
        expect(boardSurfaceOf(standingOn(word))).toBe('');
      }
    });
  });

  describe('isVisibleOnTable', () => {
    it('is true on the table', () => {
      const obj = new TabletopObject();
      obj.initialize();
      expect(obj.isVisibleOnTable).toBe(true);
    });

    it('is false anywhere else', () => {
      const obj = new TabletopObject();
      obj.initialize();
      obj.location = { name: 'graveyard', x: 0, y: 0 };
      expect(obj.isVisibleOnTable).toBe(false);
    });
  });

  describe('setLocation', () => {
    it('takes a new place', () => {
      const obj = new TabletopObject();
      obj.initialize();
      obj.setLocation('graveyard');
      expect(obj.location.name).toBe('graveyard');
    });
  });

  describe('rootDataElement', () => {
    it('starts empty', () => {
      const obj = new TabletopObject();
      obj.initialize();
      expect(obj.rootDataElement).toBeFalsy();
    });
  });

  describe('createDataElements', () => {
    it('builds its data through a protected method', () => {
      // the base class builds the elements itself
      // reachable through a subclass
      const obj = new TabletopObject();
      obj.initialize();
      // builds no root element without an alias name
      expect(obj.rootDataElement).toBeFalsy();
    });
  });

  describe('altitude', () => {
    function createTabletopObjectWithCommon(): TabletopObject {
      const obj = new TabletopObject();
      const root = DataElement.create('TabletopObject', '', {}, `TabletopObject_${obj.identifier}`);
      const common = DataElement.create('common', '', {}, `common_${obj.identifier}`);
      obj.initialize();
      obj.appendChild(root);
      root.appendChild(common);
      return obj;
    }

    it('reads a missing altitude as nothing, and adds none', () => {
      const obj = createTabletopObjectWithCommon();
      const before = obj.commonDataElement!.children.length;
      expect(obj.altitude).toBe(0);
      expect(obj.commonDataElement!.children.length).toBe(before);
    });

    it('never breeds altitude elements however often it is read', () => {
      const obj = createTabletopObjectWithCommon();
      for (let i = 0; i < 10; i++) void obj.altitude;
      const altitudes = obj.commonDataElement!.getElementsByName('altitude');
      expect(altitudes.length).toBe(0);
    });

    it('makes the element on the first write', () => {
      const obj = createTabletopObjectWithCommon();
      obj.altitude = 5;
      const altitudes = obj.commonDataElement!.getElementsByName('altitude');
      expect(altitudes.length).toBe(1);
      expect(obj.altitude).toBe(5);
    });

    it('folds repeated altitude elements into the first as it reads', () => {
      const obj = createTabletopObjectWithCommon();
      const common = obj.commonDataElement!;
      // several altitudes of one identifier piled among the children
      const altitudeId = `altitude_${obj.identifier}`;
      for (let i = 0; i < 3; i++) {
        const dup = new DataElement(altitudeId);
        dup.name = 'altitude';
        dup.value = i;
        dup.initialize();
        common.appendChild(dup);
      }
      expect(common.getElementsByName('altitude').length).toBe(3);

      const dummy = document.createElement('TabletopObject');
      obj.parseInnerXml(dummy);

      expect(common.getElementsByName('altitude').length).toBe(1);
    });

    it('keeps the one that carries a value', () => {
      const obj = createTabletopObjectWithCommon();
      const common = obj.commonDataElement!;
      const zeroAltitude = new DataElement(`altitude_${obj.identifier}_a`);
      zeroAltitude.name = 'altitude';
      zeroAltitude.value = 0;
      zeroAltitude.initialize();
      common.appendChild(zeroAltitude);

      const realAltitude = new DataElement(`altitude_${obj.identifier}_b`);
      realAltitude.name = 'altitude';
      realAltitude.value = 7;
      realAltitude.initialize();
      common.appendChild(realAltitude);

      const dummy = document.createElement('TabletopObject');
      obj.parseInnerXml(dummy);

      const survivors = common.getElementsByName('altitude');
      expect(survivors.length).toBe(1);
      expect(+survivors[0].value).toBe(7);
    });
  });

  describe('the order of the common elements', () => {
    function appendCommonChild(common: DataElement, name: string, value: number | string): DataElement {
      const el = DataElement.create(name, value, {}, `${name}_${common.identifier}`);
      common.appendChild(el);
      return el;
    }

    function createWithCommon(): { obj: TabletopObject; common: DataElement } {
      const obj = new TabletopObject();
      const root = DataElement.create('TabletopObject', '', {}, `TabletopObject_${obj.identifier}`);
      const common = DataElement.create('common', '', {}, `common_${obj.identifier}`);
      obj.initialize();
      obj.appendChild(root);
      root.appendChild(common);
      return { obj, common };
    }

    it('puts them in their usual order as it reads', () => {
      const { obj, common } = createWithCommon();
      // added in reverse on purpose
      appendCommonChild(common, 'altitude', 3);
      appendCommonChild(common, 'depth', 2);
      appendCommonChild(common, 'height', 4);
      appendCommonChild(common, 'width', 5);
      appendCommonChild(common, 'size', 1);
      appendCommonChild(common, 'name', 'foo');

      const dummy = document.createElement('TabletopObject');
      obj.parseInnerXml(dummy);

      const names = common.children.map((c) => c.getAttribute('name'));
      expect(names).toEqual(['name', 'size', 'width', 'height', 'depth', 'altitude']);
    });

    it('leaves everything else where it was', () => {
      const { obj, common } = createWithCommon();
      // a range, whose length is not one of the ordered elements
      appendCommonChild(common, 'width', 2);
      appendCommonChild(common, 'length', 5);
      appendCommonChild(common, 'name', 'r');

      const dummy = document.createElement('TabletopObject');
      obj.parseInnerXml(dummy);

      const names = common.children.map((c) => c.getAttribute('name'));
      // the ordered ones take their slots and the length stays put
      expect(names).toEqual(['name', 'length', 'width']);
    });
  });
});
