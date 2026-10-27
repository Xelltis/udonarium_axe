import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement, DataElementAttribute, DataElementRole, DataElementType } from '@axe/domain/data/data-element';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { RoomGeneralSettingsComponent } from '@axe/features/room-settings/room-general-settings/room-general-settings.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('RoomGeneralSettingsComponent', () => {
  let fixture: ComponentFixture<RoomGeneralSettingsComponent>;
  let component: RoomGeneralSettingsComponent;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [RoomGeneralSettingsComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
  });

  beforeEach(() => {
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.role = PeerRole.GameMaster;
    fixture = TestBed.createComponent(RoomGeneralSettingsComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
    (Config as unknown as { _instance: Config | undefined })._instance = undefined;
  });

  it('leaves the room’s dice to the master', () => {
    PeerCursor.myCursor.role = PeerRole.Player;

    component.defaultDiceBot.value = 'Cthulhu7th';

    expect(component.isSharedReadOnly()).toBe(true);
    expect(component.defaultDiceBot.value).not.toBe('Cthulhu7th');
  });

  it('lets the master choose where the room has its rolls tumble, and shows a player only what was chosen', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    const select: HTMLSelectElement = fixture.nativeElement.querySelector('[data-testid="dice-stage"]');
    expect(select.value).toBe('off');
    expect([...select.options].map((option) => option.value)).toEqual(['off', 'frame', 'table', 'both']);
    expect(select.disabled).toBe(false);

    select.value = 'frame';
    select.dispatchEvent(new Event('change'));
    expect(Config.instance.diceStage).toBe('frame');

    PeerCursor.myCursor.role = PeerRole.Player;
    fixture.detectChanges();
    await fixture.whenStable();
    component.diceStage.value = 'off';
    // A model-bound control takes its disabled state a turn after the binding changes.
    fixture.detectChanges();
    await fixture.whenStable();

    expect(Config.instance.diceStage).toBe('frame');
    expect(select.disabled).toBe(true);
  });

  it('lets the master turn off the bubbles over the pieces, and shows a player only that they are off', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    const box: HTMLInputElement = fixture.nativeElement.querySelector(
      '[data-testid="room-settings-speech-bubbles"] input[type="checkbox"]'
    );
    expect(box.checked).toBe(true);
    expect(box.disabled).toBe(false);

    box.click();
    expect(Config.instance.speechBubblesEnabled).toBe(false);

    PeerCursor.myCursor.role = PeerRole.Player;
    fixture.detectChanges();
    await fixture.whenStable();
    component.speechBubbles.value = true;
    fixture.detectChanges();
    await fixture.whenStable();

    expect(Config.instance.speechBubblesEnabled).toBe(false);
    expect(box.disabled).toBe(true);
    Config.instance.speechBubblesEnabled = true;
  });

  describe('the items the remotes show', () => {
    function pieceCarrying(...items: string[]): GameCharacter {
      const character = new GameCharacter();
      character.initialize();
      character.createDataElements();
      for (const item of items) {
        character.detailDataElement!.appendChild(
          DataElement.create(item, 5, {
            [DataElementAttribute.ROLE]: DataElementRole.FIELD,
            type: DataElementType.NUMBER_RESOURCE,
            currentValue: 5,
          })
        );
      }
      return character;
    }

    function chips(): HTMLInputElement[] {
      const section = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="room-settings-controller-resources"]'
      );
      return [...(section?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]') ?? [])];
    }

    beforeEach(() => {
      pieceCarrying('HP', 'MP');
      pieceCarrying('HP', '信仰');
    });

    it('lists what every piece carries, each item once, all shown while nothing is picked', async () => {
      fixture.detectChanges();
      await fixture.whenStable();

      expect(chips().map((chip) => chip.dataset['resource'])).toEqual(['HP', 'MP', '信仰']);
      expect(chips().every((chip) => chip.checked)).toBe(true);
      expect(Config.instance.controllerResources).toBeNull();
    });

    it('takes one item off the remotes and leaves the rest on', async () => {
      fixture.detectChanges();
      await fixture.whenStable();

      const mp = chips().find((chip) => chip.dataset['resource'] === 'MP')!;
      mp.checked = false;
      mp.dispatchEvent(new Event('change'));
      fixture.detectChanges();

      expect(Config.instance.controllerResources).toEqual(['HP', '信仰']);
      expect(chips().find((chip) => chip.dataset['resource'] === 'MP')!.checked).toBe(false);
    });

    it('puts an item back, and shows every item again when asked', () => {
      component.hideEveryControllerResource();
      expect(Config.instance.controllerResources).toEqual([]);

      component.setControllerResourceShown('信仰', true);
      expect(Config.instance.controllerResources).toEqual(['信仰']);

      component.showEveryControllerResource();
      expect(Config.instance.controllerResources).toBeNull();
    });

    it('leaves the pick to the master', () => {
      PeerCursor.myCursor.role = PeerRole.Player;

      component.setControllerResourceShown('MP', false);
      component.hideEveryControllerResource();

      expect(component.isSharedReadOnly()).toBe(true);
      expect(Config.instance.controllerResources).toBeNull();
    });
  });
});
