import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Party } from '@axe/domain/party/party';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { RoomRoundSettingsComponent } from '@axe/features/room-settings/room-round-settings/room-round-settings.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('RoomRoundSettingsComponent', () => {
  let fixture: ComponentFixture<RoomRoundSettingsComponent>;
  let component: RoomRoundSettingsComponent;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [RoomRoundSettingsComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
  });

  beforeEach(() => {
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.role = PeerRole.GameMaster;
    fixture = TestBed.createComponent(RoomRoundSettingsComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
    (Config as unknown as { _instance: Config | undefined })._instance = undefined;
  });

  it('lets only the master turn the sounds of a turn beginning on or off', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    const box = (testId: string): HTMLInputElement => fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);
    expect([box('room-settings-turn-signal').checked, box('room-settings-turn-tick').checked]).toEqual([true, false]);

    box('room-settings-turn-tick').click();
    box('room-settings-turn-signal').click();
    expect([Config.instance.turnSignalEnabled, Config.instance.turnTickEnabled]).toEqual([false, true]);

    PeerCursor.myCursor.role = PeerRole.Player;
    fixture.detectChanges();
    await fixture.whenStable();
    component.turnTick.value = false;
    fixture.detectChanges();
    await fixture.whenStable();

    expect(Config.instance.turnTickEnabled).toBe(true);
    expect(box('room-settings-turn-tick').disabled).toBe(true);
    expect(box('room-settings-turn-signal').disabled).toBe(true);
    Config.instance.turnSignalEnabled = true;
    Config.instance.turnTickEnabled = false;
  });

  it('asks for the notices to be shown from the round section', async () => {
    const asked = vi.fn();
    component.openNotices.subscribe(asked);
    fixture.detectChanges();
    await fixture.whenStable();

    (fixture.nativeElement.querySelector('[data-testid="room-settings-open-notices"]') as HTMLButtonElement).click();

    expect(asked).toHaveBeenCalledOnce();
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
      expect(component.turnOrderMode.value).toBe('initiative');
      expect(component.takesRoundBySides).toBe(false);
    });

    it('puts the parties in the order the round would take them', () => {
      component.turnOrderMode.value = 'faction';

      expect(component.factionOrder.map((entry) => entry.name)).toEqual(['味方', '敵', '無所属']);
    });

    it('moves a side up the order and writes it down', () => {
      component.turnOrderMode.value = 'faction';

      component.moveSide(monsters.identifier, -1);

      expect(component.factionOrder.map((entry) => entry.side)).toEqual([
        monsters.identifier,
        heroes.identifier,
        '@none',
      ]);
      expect(Config.instance.factionOrder).toContain(monsters.identifier);
    });

    it('will not move the first side any higher', () => {
      component.turnOrderMode.value = 'faction';
      const before = component.factionOrder.map((entry) => entry.side);

      component.moveSide(heroes.identifier, -1);

      expect(component.factionOrder.map((entry) => entry.side)).toEqual(before);
    });

    it('leaves the pieces on no party out of the order when asked to', () => {
      component.turnOrderMode.value = 'faction';

      component.factionSkipUnassigned.value = true;

      expect(component.factionOrder.map((entry) => entry.side)).toEqual([heroes.identifier, monsters.identifier]);
    });

    it('writes nothing for a reader who may not edit the table', () => {
      // The role has to be settled before the component is first asked anything: whether it
      // is read-only is a computed, and it holds the first answer it works out.
      Config.instance.turnOrderMode = 'faction';
      PeerCursor.myCursor.role = PeerRole.Guest;

      component.moveSide(monsters.identifier, -1);
      component.factionSkipUnassigned.value = true;

      expect(Config.instance.factionSkipUnassigned).toBe(false);
      expect(component.factionOrder.map((entry) => entry.side)[0]).toBe(heroes.identifier);
    });
  });
});
