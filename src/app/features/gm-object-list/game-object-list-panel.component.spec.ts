import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TableFocusService } from '@axe/application/tabletop/table-focus.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { VisionType } from '@axe/domain/tabletop/vision-types';
import { GameObjectListPanelComponent } from '@axe/features/gm-object-list/game-object-list-panel.component';
import { ObjectRow } from '@axe/features/gm-object-list/game-object-list-row';
import { LightSettingsComponent } from '@axe/features/tabletop/light-settings/light-settings.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

/** What the panel sets on the settings it opens, which is all this needs to stand in for. */
type OpenedSettings = Pick<LightSettingsComponent, 'target' | 'showVision' | 'showLight'>;

interface Ticking {
  tickedCharacters: () => GameCharacter[];
  tickedDisagree: () => boolean;
  isTicked: (identifier: string) => boolean;
  toggleTick: (identifier: string) => void;
  tickAllShown: () => void;
  clearTicks: () => void;
  openBulkVision: () => void;
}

describe('GameObjectListPanelComponent', () => {
  let fixture: ComponentFixture<GameObjectListPanelComponent>;
  let component: GameObjectListPanelComponent;
  let panel: Ticking;
  let opened: OpenedSettings;
  let openCalls: number;

  function makeCharacter(name: string): GameCharacter {
    const character = GameCharacter.create(name, 1, '');
    character.location.name = 'table';
    return character;
  }

  beforeEach(async () => {
    opened = { target: null, showVision: false, showLight: true };
    openCalls = 0;
    await TestBed.configureTestingModule({
      imports: [GameObjectListPanelComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
    TestBed.overrideProvider(PanelService, {
      useValue: {
        open: () => {
          openCalls++;
          return opened;
        },
        title: '',
      },
    });

    const cursor = PeerCursor.createMyCursor();
    cursor.role = PeerRole.GameMaster;

    fixture = TestBed.createComponent(GameObjectListPanelComponent);
    component = fixture.componentInstance;
    panel = component as unknown as Ticking;
  });

  afterEach(() => {
    ObjectStore.instance.getObjects().forEach((object) => ObjectStore.instance.delete(object, false));
    ObjectStore.instance.clearDeleteHistory();
  });

  it('ticks a piece and lets it go again', () => {
    const goblin = makeCharacter('ゴブリン');

    panel.toggleTick(goblin.identifier);
    expect(panel.isTicked(goblin.identifier)).toBe(true);
    expect(panel.tickedCharacters().map((c) => c.name)).toEqual(['ゴブリン']);

    panel.toggleTick(goblin.identifier);
    expect(panel.tickedCharacters()).toHaveLength(0);
  });

  it('ticks every piece the list is showing, and lets the lot go', () => {
    makeCharacter('ゴブリン');
    makeCharacter('オーク');

    panel.tickAllShown();
    expect(panel.tickedCharacters()).toHaveLength(2);

    panel.clearTicks();
    expect(panel.tickedCharacters()).toHaveLength(0);
  });

  it('leaves a tick behind on a piece that is no longer there', () => {
    const goblin = makeCharacter('ゴブリン');
    panel.toggleTick(goblin.identifier);

    goblin.destroy();

    expect(panel.tickedCharacters()).toHaveLength(0);
  });

  it('says so when the ticked pieces do not agree about their sight', () => {
    const goblin = makeCharacter('ゴブリン');
    const orc = makeCharacter('オーク');
    goblin.visionRange = 4;
    orc.visionRange = 4;

    panel.tickAllShown();
    expect(panel.tickedDisagree()).toBe(false);

    orc.visionRange = 9;
    TestBed.inject(ObjectChangeService).notifyChanged(orc.identifier);

    expect(panel.tickedDisagree()).toBe(true);
  });

  it('looks for a row on the table where its piece stands, through the table focus', () => {
    const goblin = makeCharacter('ゴブリン');
    const focusOn = vi.spyOn(TestBed.inject(TableFocusService), 'focusOn').mockImplementation(() => undefined);

    (component as unknown as { onRowClick: (row: ObjectRow) => void }).onRowClick({
      object: goblin,
      locationKind: 'table',
    } as unknown as ObjectRow);

    expect(focusOn).toHaveBeenCalledWith(goblin);
  });

  describe('setting the sight of the ticked pieces', () => {
    it('opens the sight settings alone, with no lamp in them', () => {
      makeCharacter('ゴブリン');
      panel.tickAllShown();

      panel.openBulkVision();

      expect(opened.showVision).toBe(true);
      expect(opened.showLight).toBe(false);
    });

    it('writes what the reader sets onto every ticked piece', () => {
      const goblin = makeCharacter('ゴブリン');
      const orc = makeCharacter('オーク');
      panel.tickAllShown();
      panel.openBulkVision();

      opened.target!.visionType = VisionType.DARKVISION;
      opened.target!.visionRange = 6;

      expect([goblin.visionType, orc.visionType]).toEqual([VisionType.DARKVISION, VisionType.DARKVISION]);
      expect([goblin.visionRange, orc.visionRange]).toEqual([6, 6]);
    });

    it('opens nothing when nothing is ticked', () => {
      makeCharacter('ゴブリン');

      panel.openBulkVision();

      expect(openCalls).toBe(0);
    });
  });
});
