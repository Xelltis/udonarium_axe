import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { RoomZocSettingsComponent } from '@axe/features/room-settings/room-zoc-settings/room-zoc-settings.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('RoomZocSettingsComponent', () => {
  let fixture: ComponentFixture<RoomZocSettingsComponent>;
  let component: RoomZocSettingsComponent;
  let table: GameTable;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [RoomZocSettingsComponent],
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
    fixture = TestBed.createComponent(RoomZocSettingsComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
    (Config as unknown as { _instance: Config | undefined })._instance = undefined;
  });

  it('shows what the table rules while the room has been asked nothing', () => {
    table.zocMode = 'stop';
    table.zocRange = 3;

    expect(component.answersFor('zoc')).toBe(false);
    expect(component.zocMode.value).toBe('stop');
    expect(component.zocRange.value).toBe(3);
  });

  it('hands a rule to the room the moment it is set here', () => {
    table.zocMode = 'stop';

    component.zocMode.value = 'block';

    expect(Config.instance.zocMode).toBe('block');
    expect(component.answersFor('zoc')).toBe(true);
    expect(component.answersFor('moveRange')).toBe(false);
  });

  it('lets a player set the rules of play, which are not the master’s alone', () => {
    PeerCursor.myCursor.role = PeerRole.Player;

    component.zocMode.value = 'block';

    expect(Config.instance.zocMode).toBe('block');
  });

  it('writes nothing for a reader who may not edit the table', () => {
    PeerCursor.myCursor.role = PeerRole.Guest;
    table.zocMode = 'stop';

    component.zocMode.value = 'block';

    expect(Config.instance.zocMode).toBeNull();
  });

  it('rounds a count of cells to something a walk can be measured in', () => {
    component.zocRange.value = 2.7;
    component.zocExtraCost.value = -4;

    expect(component.zocRange.value).toBe(2);
    expect(component.zocExtraCost.value).toBe(0);
  });

  it('asks nothing more where an enemy holds no ground', () => {
    component.zocMode.value = 'none';

    expect(component.showsZocOptions).toBe(false);
    expect(component.showsZocExtraCost).toBe(false);
  });

  it('asks how far the ground reaches, and what it costs only where it is charged for', () => {
    component.zocMode.value = 'stop';
    expect(component.showsZocOptions).toBe(true);
    expect(component.showsZocExtraCost).toBe(false);

    component.zocMode.value = 'block';
    expect(component.showsZocExtraCost).toBe(false);

    component.zocMode.value = 'cost';
    expect(component.showsZocOptions).toBe(true);
    expect(component.showsZocExtraCost).toBe(true);
  });

  it('reads a table carrying something it does not know as holding no ground', () => {
    table.zocMode = 'engagement';

    expect(component.zocMode.value).toBe('none');
  });

  it('takes a reach that is not a whole count as none at all', () => {
    component.zocRange.value = Number.NaN;
    component.zocExtraCost.value = -2;

    expect(component.zocRange.value).toBe(0);
    expect(component.zocExtraCost.value).toBe(0);
  });

  it('shows the boxes only once an enemy holds ground', async () => {
    function boxes(): string[] {
      return [...fixture.nativeElement.querySelectorAll('input[type="number"]')].map(
        (node: Element) => node.getAttribute('name') ?? ''
      );
    }

    component.zocMode.value = 'none';
    fixture.detectChanges();
    await fixture.whenStable();
    expect(boxes()).not.toContain('zocRange');

    component.zocMode.value = 'stop';
    fixture.detectChanges();
    await fixture.whenStable();
    expect(boxes()).toContain('zocRange');
    expect(boxes()).not.toContain('zocExtraCost');

    component.zocMode.value = 'cost';
    fixture.detectChanges();
    await fixture.whenStable();
    expect(boxes()).toContain('zocExtraCost');
  });

  it('asks how a fight is left only once pieces meeting in held ground fight as one', async () => {
    component.zocMode.value = 'stop';
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[data-testid="room-settings-break-out-mode"]')).toBeNull();

    component.zocEngages.value = true;
    component.breakOutMode.value = 'cost';
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('[data-testid="room-settings-break-out-mode"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('input[name="breakOutCost"]')).not.toBeNull();
  });
});
