import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { RoomZoneRideSettingsComponent } from '@axe/features/room-settings/room-zone-ride-settings/room-zone-ride-settings.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('RoomZoneRideSettingsComponent', () => {
  let fixture: ComponentFixture<RoomZoneRideSettingsComponent>;
  let component: RoomZoneRideSettingsComponent;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [RoomZoneRideSettingsComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
  });

  beforeEach(() => {
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.role = PeerRole.GameMaster;
    const table = new GameTable();
    table.width = 10;
    table.height = 10;
    table.gridSize = 50;
    table.initialize();
    fixture = TestBed.createComponent(RoomZoneRideSettingsComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
    (Config as unknown as { _instance: Config | undefined })._instance = undefined;
  });

  async function drawn(): Promise<HTMLElement> {
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  describe('engagement zones', () => {
    function zoneSection(): HTMLElement | null {
      return (fixture.nativeElement as HTMLElement).querySelector('[data-testid="room-settings-zone"]');
    }

    it('writes whether the room plays zones, and asks the rest only once it does', async () => {
      await drawn();
      expect(zoneSection()?.querySelector('input[name="zoneSizes"]')).toBeNull();

      component.zoneEnabled.value = true;
      await drawn();

      expect(Config.instance.zoneRuleAnswers.enabled).toBe(true);
      expect(zoneSection()?.querySelector('input[name="zoneSizes"]')).not.toBeNull();
    });

    it('writes the size table, the counted field and the same-point distance, and forgets what is left empty', () => {
      component.zoneEnabled.value = true;
      component.zoneSizes.value = ' 4:2:3,8:3:5 ';
      component.zoneCountField.value = '体数';
      component.zoneSamePointM.value = 1.5;

      expect(Config.instance.zoneRuleAnswers).toEqual({
        enabled: true,
        sizes: '4:2:3,8:3:5',
        countField: '体数',
        samePointM: 1.5,
        outnumber: null,
        leaveKind: null,
        blockRadiusM: null,
        clearName: null,
        stealthUnseen: null,
      });

      component.zoneSizes.value = '';
      component.zoneEnabled.value = false;
      expect(Config.instance.zoneRuleAnswers.sizes).toBeNull();
      expect(Config.instance.zoneRuleAnswers.enabled).toBeNull();
    });

    it('writes whether a piece in stealth counts as unseen, and forgets it when unticked', () => {
      component.zoneEnabled.value = true;

      component.zoneStealthUnseen.value = true;
      expect(Config.instance.zoneRuleAnswers.stealthUnseen).toBe(true);
      expect(component.zoneStealthUnseen.value).toBe(true);

      component.zoneStealthUnseen.value = false;
      expect(Config.instance.zoneRuleAnswers.stealthUnseen).toBeNull();
    });

    it('writes the outnumbering factor and the kind that leaves an overflowing zone, out of the kinds written', async () => {
      component.zoneEnabled.value = true;
      Config.instance.moveKinds = '全力:3:,通常:1:';
      component.zoneOutnumber.value = 3;
      component.zoneLeaveKind.value = '全力';
      await drawn();

      expect(Config.instance.zoneRuleAnswers.outnumber).toBe(3);
      expect(Config.instance.zoneRuleAnswers.leaveKind).toBe('全力');
      const choices = [...zoneSection()!.querySelectorAll('select[name="zoneLeaveKind"] option')].map(
        (option) => (option as HTMLOptionElement).value
      );
      expect(choices).toEqual(['', '全力', '通常']);

      component.zoneOutnumber.value = 0;
      component.zoneLeaveKind.value = '';
      expect(Config.instance.zoneRuleAnswers.outnumber).toBeNull();
      expect(Config.instance.zoneRuleAnswers.leaveKind).toBeNull();
    });

    it('warns while the move range holds fights of its own beside the zones', async () => {
      component.zoneEnabled.value = true;
      Config.instance.zocMode = 'stop';
      Config.instance.zocEngages = true;
      await drawn();

      expect(zoneSection()?.querySelector('[data-testid="zone-engagement-warning"]')).not.toBeNull();
    });

    it('writes whether moves may be stepped into, and by which kind, out of the kinds written', async () => {
      component.zoneEnabled.value = true;
      Config.instance.moveKinds = '全力:3:,通常:1:';
      component.interruptEnabled.value = true;
      component.interruptKind.value = '通常';
      await drawn();

      expect(Config.instance.interruptEnabled).toBe(true);
      expect(Config.instance.interruptKind).toBe('通常');
      const choices = [...zoneSection()!.querySelectorAll('select[name="interruptKind"] option')].map(
        (option) => (option as HTMLOptionElement).value
      );
      expect(choices).toEqual(['', '全力', '通常']);

      component.interruptKind.value = '';
      expect(Config.instance.interruptKind).toBeNull();
    });

    it('writes the starting distances and what a distance does, and forgets them left empty', () => {
      component.placementDistances.value = ' 近い:10 ';
      component.distanceModifiers.value = '10:修正なし';
      expect(Config.instance.placementDistances).toBe('近い:10');
      expect(Config.instance.distanceModifiers).toBe('10:修正なし');

      component.placementDistances.value = '';
      component.distanceModifiers.value = '';
      expect(Config.instance.placementDistances).toBeNull();
      expect(Config.instance.distanceModifiers).toBeNull();
    });

    it('writes how far a piece blocks a line of fire, and the name that fires past it', () => {
      component.zoneBlockRadiusM.value = 1.5;
      component.zoneClearName.value = ' 精密 ';

      expect(Config.instance.zoneRuleAnswers.blockRadiusM).toBe(1.5);
      expect(Config.instance.zoneRuleAnswers.clearName).toBe('精密');

      component.zoneBlockRadiusM.value = -1;
      component.zoneClearName.value = '';
      expect(Config.instance.zoneRuleAnswers.blockRadiusM).toBeNull();
      expect(Config.instance.zoneRuleAnswers.clearName).toBeNull();
    });

    it('leaves the room as it was for somebody watching', () => {
      PeerCursor.myCursor.role = PeerRole.Guest;

      component.zoneEnabled.value = true;

      expect(Config.instance.zoneRuleAnswers.enabled).toBeNull();
    });
  });

  describe('pieces riding mounts', () => {
    it('writes the fields for steering and what a mount asks, and forgets them left empty', () => {
      component.rideSkillField.value = ' 騎乗 ';
      component.rideRequireField.value = '要求';
      expect(Config.instance.rideSkillField).toBe('騎乗');
      expect(Config.instance.rideRequireField).toBe('要求');

      component.rideSkillField.value = '';
      component.rideRequireField.value = ' ';
      expect(Config.instance.rideSkillField).toBeNull();
      expect(Config.instance.rideRequireField).toBeNull();
    });

    it('writes the shortest fall and the line rolled for one, showing the default fall where none is written', () => {
      expect(component.fallMinM.value).toBe(2);

      component.fallMinM.value = 3;
      component.fallDamage.value = ' {m}d6 ';
      expect(Config.instance.fallMinM).toBe(3);
      expect(Config.instance.fallDamage).toBe('{m}d6');

      component.fallMinM.value = Number.NaN;
      component.fallDamage.value = '';
      expect(Config.instance.fallMinM).toBeNull();
      expect(component.fallMinM.value).toBe(2);
      expect(Config.instance.fallDamage).toBeNull();
    });

    it('writes the buff for riding two up, and forgets it left empty', () => {
      component.twoUpBuff.value = ' &ふたり乗り/判定-1/99 ';
      expect(Config.instance.twoUpBuff).toBe('&ふたり乗り/判定-1/99');

      component.twoUpBuff.value = '';
      expect(Config.instance.twoUpBuff).toBeNull();
    });

    it('draws the fall and two-up settings with the rest of the riding ones', async () => {
      const section = (await drawn()).querySelector('[data-testid="room-settings-ride"]');

      expect(section?.querySelector('input[name="fallMinM"]')).not.toBeNull();
      expect(section?.querySelector('input[name="fallDamage"]')).not.toBeNull();
      expect(section?.querySelector('input[name="twoUpBuff"]')).not.toBeNull();
    });
  });
});
