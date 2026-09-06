import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Party } from '@axe/domain/party/party';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { GameTable, GridType } from '@axe/domain/tabletop/game-table';
import { RoomPanelService } from '@axe/features/panels/room-panel.service';
import { RoomSettingsPanelComponent } from '@axe/features/room-settings/room-settings-panel/room-settings-panel.component';
import { expectPanelDragRecovery, PanelDragTestHostComponent } from '@axe/testing/panel-drag-recovery';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('RoomSettingsPanelComponent', () => {
  let fixture: ComponentFixture<RoomSettingsPanelComponent>;
  let component: RoomSettingsPanelComponent;
  let table: GameTable;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [RoomSettingsPanelComponent, PanelDragTestHostComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
  });

  beforeEach(() => {
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.role = PeerRole.GameMaster;
    table = new GameTable();
    table.width = 10;
    table.height = 10;
    table.gridSize = 50;
    table.initialize();
    fixture = TestBed.createComponent(RoomSettingsPanelComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
    (Config as unknown as { _instance: Config | undefined })._instance = undefined;
  });

  it('should be created', () => {
    expect(component).toBeTruthy();
  });

  it('asks for no change detector', () => {
    expect((component as unknown as { changeDetector?: unknown }).changeDetector).toBeUndefined();
  });

  it('lets the panel take the pointer again once the drag ends', async () => {
    await expectPanelDragRecovery(RoomSettingsPanelComponent);
  });

  it('shows what the table rules while the room has been asked nothing', () => {
    table.zocMode = 'stop';
    table.zocRange = 3;

    expect(component.answersFor('zoc')).toBe(false);
    expect(component.zocMode).toBe('stop');
    expect(component.zocRange).toBe(3);
  });

  it('hands a rule to the room the moment it is set here', () => {
    table.zocMode = 'stop';

    component.zocMode = 'block';

    expect(Config.instance.zocMode).toBe('block');
    expect(component.answersFor('zoc')).toBe(true);
    expect(component.answersFor('moveRange')).toBe(false);
  });

  it('writes nothing for a reader who may not edit the table', () => {
    PeerCursor.myCursor.role = PeerRole.Guest;
    table.zocMode = 'stop';

    component.zocMode = 'block';

    expect(component.isReadOnly()).toBe(true);
    expect(Config.instance.zocMode).toBeNull();
  });

  it('rounds a count of cells to something a walk can be measured in', () => {
    component.zocRange = 2.7;
    component.zocExtraCost = -4;

    expect(component.zocRange).toBe(2);
    expect(component.zocExtraCost).toBe(0);
  });

  describe('how the round is taken', () => {
    let heroes: Party;
    let monsters: Party;

    beforeEach(() => {
      heroes = new Party();
      heroes.name = '味方';
      heroes.initialize();
      monsters = new Party();
      monsters.name = '敵';
      monsters.initialize();
    });

    it('takes the round one piece at a time until it is asked otherwise', () => {
      expect(component.turnOrderMode).toBe('initiative');
      expect(component.takesRoundBySides).toBe(false);
    });

    it('puts the parties in the order the round would take them', () => {
      component.turnOrderMode = 'faction';

      expect(component.factionOrder.map((entry) => entry.name)).toEqual(['味方', '敵', '無所属']);
    });

    it('moves a side up the order and writes it down', () => {
      component.turnOrderMode = 'faction';

      component.moveSide(monsters.identifier, -1);

      expect(component.factionOrder.map((entry) => entry.side)).toEqual([
        monsters.identifier,
        heroes.identifier,
        '@none',
      ]);
      expect(Config.instance.factionOrder).toContain(monsters.identifier);
    });

    it('will not move the first side any higher', () => {
      component.turnOrderMode = 'faction';
      const before = component.factionOrder.map((entry) => entry.side);

      component.moveSide(heroes.identifier, -1);

      expect(component.factionOrder.map((entry) => entry.side)).toEqual(before);
    });

    it('leaves the pieces on no party out of the order when asked to', () => {
      component.turnOrderMode = 'faction';

      component.factionSkipUnassigned = true;

      expect(component.factionOrder.map((entry) => entry.side)).toEqual([heroes.identifier, monsters.identifier]);
    });

    it('writes nothing for a reader who may not edit the table', () => {
      // The role has to be settled before the component is first asked anything: whether it
      // is read-only is a computed, and it holds the first answer it works out.
      Config.instance.turnOrderMode = 'faction';
      PeerCursor.myCursor.role = PeerRole.Guest;

      component.moveSide(monsters.identifier, -1);
      component.factionSkipUnassigned = true;

      expect(Config.instance.factionSkipUnassigned).toBe(false);
      expect(component.factionOrder.map((entry) => entry.side)[0]).toBe(heroes.identifier);
    });
  });

  describe('how a piece shows which way it faces', () => {
    it('shows what the table asks for while the room has been asked nothing', () => {
      table.facingMark = 'arrow';

      expect(component.answersFor('facing')).toBe(false);
      expect(component.facingMark).toBe('arrow');
    });

    it('takes the choice over from the table', () => {
      table.facingMark = 'arrow';

      component.facingMark = 'turn';

      expect(component.facingMark).toBe('turn');
      expect(component.answersFor('facing')).toBe(true);
      expect(table.facingMark).toBe('arrow');
    });

    it('reads something it does not know as showing nothing', () => {
      table.facingMark = 'compass' as never;

      expect(component.facingMark).toBe('none');
    });
  });

  describe('the questions it puts', () => {
    it('puts the question of corners only to a square board', () => {
      table.gridType = GridType.SQUARE;
      expect(component.showsDiagonalOption).toBe(true);

      table.gridType = GridType.HEX_VERTICAL;
      expect(component.showsDiagonalOption).toBe(false);
    });

    it('asks what a cell stands for only where it is not ruled in cells', () => {
      component.cellDistanceUnit = 'cell';
      expect(component.showsCellDistance).toBe(false);

      component.cellDistanceUnit = 'foot';
      expect(component.showsCellDistance).toBe(true);
    });

    it('asks nothing more where an enemy holds no ground', () => {
      component.zocMode = 'none';

      expect(component.showsZocOptions).toBe(false);
      expect(component.showsZocExtraCost).toBe(false);
    });

    it('asks how far the ground reaches, and what it costs only where it is charged for', () => {
      component.zocMode = 'stop';
      expect(component.showsZocOptions).toBe(true);
      expect(component.showsZocExtraCost).toBe(false);

      component.zocMode = 'block';
      expect(component.showsZocExtraCost).toBe(false);

      component.zocMode = 'cost';
      expect(component.showsZocOptions).toBe(true);
      expect(component.showsZocExtraCost).toBe(true);
    });

    it('reads a table carrying something it does not know as holding no ground', () => {
      table.zocMode = 'engagement';

      expect(component.zocMode).toBe('none');
    });

    it('takes a reach that is not a whole count as none at all', () => {
      component.zocRange = Number.NaN;
      component.zocExtraCost = -2;

      expect(component.zocRange).toBe(0);
      expect(component.zocExtraCost).toBe(0);
    });

    it('takes a distance that is not a number as no conversion at all', () => {
      component.cellDistance = Number.NaN;

      expect(component.cellDistance).toBe(0);
    });

    it('opens on the general part and shows only that part', async () => {
      fixture.detectChanges();
      await fixture.whenStable();

      expect(component.tab()).toBe('general');
      expect(fixture.nativeElement.querySelector('[name="turnOrderMode"]')).toBeNull();
      expect(fixture.nativeElement.querySelector('[name="zocMode"]')).toBeNull();
    });

    it('shows the round only under the part it belongs to', async () => {
      component.tab.set('battle');
      fixture.detectChanges();
      await fixture.whenStable();

      expect(fixture.nativeElement.querySelector('[name="turnOrderMode"]')).not.toBeNull();
    });

    it('leaves a reader who may not edit free to look through the parts', async () => {
      PeerCursor.myCursor.role = PeerRole.Guest;
      fixture.detectChanges();
      await fixture.whenStable();

      expect(component.isReadOnly()).toBe(true);
      expect(fixture.nativeElement.hasAttribute('inert')).toBe(false);
      const strip = fixture.nativeElement.querySelector('[data-testid="room-settings-tab-move"]');
      expect(strip.closest('[inert]')).toBeNull();
    });

    it('reaches the character import from the utility part', async () => {
      const opened: string[] = [];
      vi.spyOn(TestBed.inject(RoomPanelService), 'open').mockImplementation(((name: string) => {
        opened.push(name);
      }) as never);
      component.tab.set('utility');
      fixture.detectChanges();
      await fixture.whenStable();

      fixture.nativeElement.querySelector('[data-testid="room-settings-character-import"]').click();

      expect(opened).toEqual(['characterImport']);
    });

    it('shows the boxes only once an enemy holds ground', async () => {
      function boxes(): string[] {
        return [...fixture.nativeElement.querySelectorAll('input[type="number"]')].map(
          (node: Element) => node.getAttribute('name') ?? ''
        );
      }

      component.tab.set('move');
      component.zocMode = 'none';
      fixture.detectChanges();
      await fixture.whenStable();
      expect(boxes()).not.toContain('zocRange');

      component.zocMode = 'stop';
      fixture.detectChanges();
      await fixture.whenStable();
      expect(boxes()).toContain('zocRange');
      expect(boxes()).not.toContain('zocExtraCost');

      component.zocMode = 'cost';
      fixture.detectChanges();
      await fixture.whenStable();
      expect(boxes()).toContain('zocExtraCost');
    });
  });

  it('does not throw when it is drawn', () => {
    expect(() => fixture.detectChanges()).not.toThrow();
  });
});
