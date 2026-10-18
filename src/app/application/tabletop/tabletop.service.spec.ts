import { inject, TestBed } from '@angular/core/testing';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { TabletopDisplayPreferenceService } from '@axe/application/ui/tabletop-display-preference.service';
import { ViewModePreferenceService } from '@axe/application/ui/view-mode-preference.service';
import { emitXmlLoaded } from '@axe/core/event/domain-events';
import { ObjectStore } from '@axe/core/sync/object-store';
import { xml2element } from '@axe/core/util/xml-util';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { Party } from '@axe/domain/party/party';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { LightSource } from '@axe/domain/tabletop/light-source';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('TabletopService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [...TEST_PROVIDERS, TabletopService],
    });
  });

  it('should be created', inject([TabletopService], (service: TabletopService) => {
    expect(service).toBeTruthy();
  }));

  describe('a character brought in from a file', () => {
    afterEach(() => {
      for (const character of ObjectStore.instance.getObjects(GameCharacter)) character.destroy();
      for (const party of ObjectStore.instance.getObjects(Party)) party.destroy();
      PeerCursor.myCursor = null!;
    });

    it('belongs to the one who brought it in, not to whoever saved it', () => {
      TestBed.inject(TabletopService);
      PeerCursor.createMyCursor().userId = 'the-dropper';

      emitXmlLoaded({ xmlElement: xml2element('<character owner="whoever-saved-it"></character>')! });

      const [character] = ObjectStore.instance.getObjects(GameCharacter);
      expect(character.owner).toBe('the-dropper');
    });

    it('joins no party, even one in this room under the name it was saved with', () => {
      TestBed.inject(TabletopService);
      new Party('party-1').initialize();

      emitXmlLoaded({ xmlElement: xml2element('<character partyIdentifier="party-1"></character>')! });

      const [character] = ObjectStore.instance.getObjects(GameCharacter);
      expect(character.partyIdentifier).toBe('');
    });
  });

  describe('a chat tab brought in from a file', () => {
    afterEach(() => {
      for (const tab of ObjectStore.instance.getObjects(ChatTab)) tab.destroy();
      ObjectStore.instance.clearDeleteHistory();
      vi.restoreAllMocks();
    });

    const saved = '<chat-tab identifier="tab-saved" name="冒険"><chat identifier="line-saved">x</chat></chat-tab>';

    it('comes in as a copy under names of its own beside a tab here under the names it was saved with', () => {
      TestBed.inject(TabletopService);
      const here = ChatTabList.instance.addChatTab('冒険', 'tab-saved');

      emitXmlLoaded({ xmlElement: xml2element(saved)! });

      const tabs = ObjectStore.instance.getObjects(ChatTab).filter((tab) => tab.name === '冒険');
      expect(tabs).toHaveLength(2);
      expect(tabs.find((tab) => tab !== here)?.identifier).not.toBe('tab-saved');
      expect(ObjectStore.instance.get('tab-saved')).toBe(here);
    });

    it('points the copy’s replies and quotations at its own lines, not at the tab it stands beside', () => {
      TestBed.inject(TabletopService);
      ChatTabList.instance.addChatTab('冒険', 'tab-saved');

      emitXmlLoaded({
        xmlElement: xml2element(
          '<chat-tab identifier="tab-saved" name="冒険"><chat identifier="line-1">x</chat>' +
            '<chat identifier="line-2" replyTo="line-1" quoteOf="line-1">y</chat></chat-tab>'
        )!,
      });

      const copy = ObjectStore.instance.getObjects(ChatTab).find((tab) => tab.identifier !== 'tab-saved')!;
      const first = copy.chatMessages.find((line) => line.text === 'x')!;
      const second = copy.chatMessages.find((line) => line.text === 'y')!;
      expect(first.identifier).not.toBe('line-1');
      expect(second.replyTo).toBe(first.identifier);
      expect(second.quoteOf).toBe(first.identifier);
    });

    it('says the tab and its lines are coming back under their names when none is here', () => {
      TestBed.inject(TabletopService);
      const announce = vi.spyOn(ObjectStore.instance, 'announceComingBack');

      emitXmlLoaded({ xmlElement: xml2element(saved)! });

      expect(announce).toHaveBeenCalledWith(['tab-saved', 'line-saved']);
      expect(ObjectStore.instance.get('tab-saved')).toBeInstanceOf(ChatTab);
    });
  });

  describe('lightSources', () => {
    it('brings the lights of the table being looked at, and leaves the other table its own', async () => {
      const service = TestBed.inject(TabletopService);
      const here = new GameTable();
      here.initialize();
      const there = new GameTable();
      there.initialize();
      const lamp = LightSource.create('lamp');
      lamp.location = { name: 'table', x: 0, y: 0 };
      there.appendChild(lamp);
      TableSelecter.instance.viewTableIdentifier = here.identifier;
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(service.lightSources).toEqual([]);

      TableSelecter.instance.viewTableIdentifier = there.identifier;
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(service.lightSources.map((light) => light.identifier)).toEqual([lamp.identifier]);

      here.destroy();
      there.destroy();
    });
  });

  describe("changing the size of a table's cells", () => {
    let here: GameTable;
    let there: GameTable;
    let goblin: GameCharacter;
    let wall: Terrain;

    beforeEach(async () => {
      here = new GameTable();
      here.gridSize = 50;
      here.initialize();
      there = new GameTable();
      there.gridSize = 50;
      there.initialize();
      wall = Terrain.create('壁', 1, 1, 1, '', '');
      wall.location = { ...wall.location, x: 50, y: 100 };
      there.appendChild(wall);
      goblin = GameCharacter.create('ゴブリン', 1, '');
      goblin.location = { ...goblin.location, name: 'table', x: 100, y: 150 };
      TableSelecter.instance.viewTableIdentifier = here.identifier;
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    afterEach(() => {
      for (const object of [goblin, wall, here, there]) object.destroy();
    });

    it('moves the pieces out on the table in view along with it', () => {
      TestBed.inject(TabletopService).changeCellSize(here, 100);

      expect(here.gridSize).toBe(100);
      expect([goblin.location.x, goblin.location.y]).toEqual([200, 300]);
    });

    it('moves only the pieces of a table that is not in view', () => {
      TestBed.inject(TabletopService).changeCellSize(there, 25);

      expect(there.gridSize).toBe(25);
      expect([wall.location.x, wall.location.y]).toEqual([25, 50]);
      expect([goblin.location.x, goblin.location.y]).toEqual([100, 150]);
    });

    it('keeps the size within the bounds a cell may take', () => {
      TestBed.inject(TabletopService).changeCellSize(here, 9999);

      expect(here.gridSize).toBe(256);
    });
  });

  describe('currentTableVersion', () => {
    let table: GameTable;

    beforeEach(() => {
      table = new GameTable();
      table.initialize();
      TableSelecter.instance.viewTableIdentifier = table.identifier;
    });

    afterEach(() => {
      ObjectStore.instance.remove(table);
    });

    /**
     * It hands back the same table every time, so under the default equality a new version never reaches anything downstream.
     * It shows up as an edit that never appears on screen.
     */
    it('carries a change to the table through to everything derived from it', async () => {
      const service = TestBed.inject(TabletopService);
      expect(service.gridSize()).toBe(table.gridSize);
      expect(service.mode2d()).toBe(false);
      expect(service.orthographicProjection()).toBe(false);

      table.gridSize = 77;
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(service.gridSize()).toBe(77);
    });

    it('lies flat where this reader asked for that, whatever the table recommends', () => {
      const service = TestBed.inject(TabletopService);
      expect(service.mode2d()).toBe(false);

      TestBed.inject(ViewModePreferenceService).choose('flat');

      expect(service.mode2d()).toBe(true);
    });

    it.each([
      ['auto', false, false],
      ['auto', true, true],
      ['perspective', false, false],
      ['perspective', true, false],
      ['flat', false, true],
      ['flat', true, true],
    ] as const)(
      'gives a seat asking for %s over a table recommending flat %s an effective 2D of %s',
      async (seat, recommendsFlat, effective) => {
        const service = TestBed.inject(TabletopService);
        table.mode2d = recommendsFlat;
        TestBed.inject(ViewModePreferenceService).choose(seat);
        await new Promise((resolve) => setTimeout(resolve, 20));

        expect(service.recommendsFlat()).toBe(recommendsFlat);
        expect(service.seatViewMode()).toBe(seat);
        expect(service.mode2d()).toBe(effective);
      }
    );

    it('drops the perspective the table asks to be drawn without, but only while it is seen flat', async () => {
      const service = TestBed.inject(TabletopService);
      table.orthographicProjection = true;
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(service.orthographicProjection()).toBe(false);

      table.mode2d = true;
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(service.orthographicProjection()).toBe(true);
    });

    it('answers with what this screen was told, and with the table for the rest', async () => {
      const service = TestBed.inject(TabletopService);
      table.multiAngleEnabled = true;
      table.multiAngleTickerEnabled = true;
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(service.display().multiAngleEnabled).toBe(true);

      TestBed.inject(TabletopDisplayPreferenceService).set({ multiAngleEnabled: false });

      expect(service.display().multiAngleEnabled).toBe(false);
      expect(service.display().multiAngleTickerEnabled).toBe(true);

      TestBed.inject(TabletopDisplayPreferenceService).forget();

      expect(service.display().multiAngleEnabled).toBe(true);
    });
  });
});
