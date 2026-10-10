import { TestBed } from '@angular/core/testing';
import { ObjectFactory } from '@axe/core/sync/object-factory';
import { ObjectSerializer } from '@axe/core/sync/object-serializer';
import { ObjectStore } from '@axe/core/sync/object-store';
import {
  BoardSwitch,
  resetSwitch,
  spendSwitch,
  switchHasGoFor,
  switchOf,
  switchWasPressed,
} from '@axe/domain/tabletop/board-switch/board-switch';
import { defaultSwitchDefinition, newSwitchAction } from '@axe/domain/tabletop/board-switch/switch-definition';
import { Terrain } from '@axe/domain/tabletop/terrain';

/**
 * The attributes of a saved element, as the reader is handed them.
 *
 * Built by hand rather than off an element: happy-dom folds the case of an attribute name away,
 * and the names a switch is saved under have case in them.
 */
function attributesOf(written: Record<string, string>): NamedNodeMap {
  return Object.entries(written).map(([name, value]) => ({ name, value })) as unknown as NamedNodeMap;
}

describe('BoardSwitch', () => {
  beforeEach(() => TestBed.configureTestingModule({}));

  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  function switchOn(terrain: Terrain): BoardSwitch {
    const made = new BoardSwitch();
    made.initialize();
    terrain.appendChild(made);
    return made;
  }

  it('is known to the object factory, so a saved switch is read back as one', () => {
    const made = ObjectFactory.instance.create('board-switch');

    expect(made).toBeInstanceOf(BoardSwitch);
    made?.destroy();
  });

  it('hangs under the block it belongs to, and is found there', () => {
    const terrain = Terrain.create('宝箱', 1, 1, 1, '', '');
    expect(terrain.boardSwitch).toBeNull();

    const made = switchOn(terrain);

    expect(switchOf(terrain)).toBe(made);
    expect(terrain.boardSwitch).toBe(made);
  });

  it('writes what it does and what has happened to it into the saved room', () => {
    const made = new BoardSwitch();
    made.initialize();
    made.write({ ...defaultSwitchDefinition(), label: 'lever' });

    const xml = ObjectSerializer.instance.toXml(made);

    expect(xml).toContain('<board-switch');
    expect(xml).toContain('definition="');
    expect(xml).toContain('lever');
    expect(xml).toContain('spentRound="-1"');
  });

  it('reads a switch saved with nothing on it as one that does nothing and was never pressed', () => {
    const made = new BoardSwitch();
    made.initialize();

    made.parseAttributes(attributesOf({}));

    expect(made.def).toEqual(defaultSwitchDefinition());
    expect(made.spent).toBeFalsy();
    expect(made.retired).toBeFalsy();
    expect(made.lastRound).toBe(-1);
  });

  it('reads an empty round as never pressed rather than pressed in the first round', () => {
    const made = new BoardSwitch();
    made.initialize();

    made.parseAttributes(attributesOf({ spentRound: '' }));
    expect(made.lastRound).toBe(-1);

    made.parseAttributes(attributesOf({ spentRound: '3' }));
    expect(made.lastRound).toBe(3);
  });

  it('reads an update from a peer that hands over none of its settings as a switch that does nothing', () => {
    const made = new BoardSwitch();
    made.initialize();
    made.write({ ...defaultSwitchDefinition(), label: 'lever' });
    const context = made.toContext();

    made.apply({ ...context, syncData: { ...context.syncData, attributes: {} }, majorVersion: made.majorVersion + 1 });

    expect(made.def).toEqual(defaultSwitchDefinition());
    expect(made.lastRound).toBe(-1);
  });

  it('leaves the switch where it is when an older peer hands over the block it hangs under', () => {
    const terrain = Terrain.create('宝箱', 1, 1, 1, '', '');
    const before = terrain.toContext();
    const made = switchOn(terrain);
    made.write({ ...defaultSwitchDefinition(), label: 'open' });

    terrain.apply({ ...before, majorVersion: terrain.majorVersion + 1 });

    expect(terrain.boardSwitch).toBe(made);
    expect(made.def.label).toBe('open');
  });

  it('carries what a newer version wrote through a press written by this one', () => {
    const made = new BoardSwitch();
    made.initialize();
    const newer = JSON.stringify({ v: 2, label: 'lever', range: 2, actions: [{ kind: 'weather', strength: 3 }] });
    made.definition = newer;

    made.spentRound = 4;
    made.spentBy = 'hero';

    expect(made.definition).toBe(newer);
  });

  it('writes nothing where what it does has not changed, so an idle panel sends nothing', () => {
    const made = new BoardSwitch();
    made.initialize();
    made.write({ ...defaultSwitchDefinition(), actions: [{ ...newSwitchAction('say'), text: 'hi' }] });
    const version = made.majorVersion;

    made.write(made.def);

    expect(made.majorVersion).toBe(version);
  });

  describe('counting its presses', () => {
    function counting(repeat: 'always' | 'once' | 'oncePerPiece' | 'oncePerRound'): BoardSwitch {
      const made = new BoardSwitch();
      made.initialize();
      made.write({ ...defaultSwitchDefinition(), repeat });
      return made;
    }

    it('goes any number of times where it is not counted', () => {
      const made = counting('always');
      spendSwitch(made, 'hero', 1);

      expect(switchHasGoFor(made, 'hero', 1)).toBe(true);
      expect(switchWasPressed(made)).toBe(false);
    });

    it('goes once for everybody, once for each presser, or once a round', () => {
      const once = counting('once');
      spendSwitch(once, 'hero', 1);
      expect(switchHasGoFor(once, 'rogue', 1)).toBe(false);

      const each = counting('oncePerPiece');
      spendSwitch(each, 'hero', 1);
      expect(switchHasGoFor(each, 'hero', 1)).toBe(false);
      expect(switchHasGoFor(each, 'rogue', 1)).toBe(true);

      const perRound = counting('oncePerRound');
      spendSwitch(perRound, 'hero', 2);
      expect(switchHasGoFor(perRound, 'rogue', 2)).toBe(false);
      expect(switchHasGoFor(perRound, 'rogue', 3)).toBe(true);
    });

    it('forgets every press when the master sets it again', () => {
      const made = counting('once');
      spendSwitch(made, 'hero', 1);
      expect(switchWasPressed(made)).toBe(true);

      resetSwitch(made);

      expect(switchWasPressed(made)).toBe(false);
      expect(switchHasGoFor(made, 'hero', 1)).toBe(true);
    });

    it('counts one a press put away as pressed, and sets it back out when set again', () => {
      const made = counting('always');
      made.retired = true;
      expect(switchWasPressed(made)).toBe(true);

      resetSwitch(made);

      expect(made.retired).toBe(false);
      expect(switchWasPressed(made)).toBe(false);
    });
  });

  it('reads a saved block that carries something this version has never heard of as the block it is', () => {
    const saved =
      '<terrain><data name="terrain"><data name="common"><data name="name">丘</data></data></data>' +
      '<board-switch-next definition="{}"></board-switch-next></terrain>';
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const read = ObjectSerializer.instance.parseXml(saved);

    expect(read).toBeInstanceOf(Terrain);
    expect((read as Terrain).name).toBe('丘');
    expect((read as Terrain).boardSwitch).toBeNull();
    error.mockRestore();
  });
});
