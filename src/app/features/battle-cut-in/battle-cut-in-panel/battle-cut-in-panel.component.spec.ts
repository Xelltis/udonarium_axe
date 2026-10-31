import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BattleCutInPreferenceService } from '@axe/application/battle/battle-cut-in-preference.service';
import { BattleLaunchService } from '@axe/application/battle/battle-launch.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { waitZeroTimeout } from '@axe/core/util/zero-timeout';
import { BATTLE_PICTURE_LIMIT, DEFAULT_BATTLE_SETTINGS } from '@axe/domain/battle/battle-settings';
import { GameCharacter } from '@axe/domain/character/game-character';
import { createEffectPreset, DEFAULT_EFFECT_PRESET_SEEDS } from '@axe/domain/effect/builtin-effect-presets';
import { Party } from '@axe/domain/party/party';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { TurnState } from '@axe/domain/tabletop/turn-state';
import { BattleCutInPanelComponent } from '@axe/features/battle-cut-in/battle-cut-in-panel/battle-cut-in-panel.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('BattleCutInPanelComponent', () => {
  let fixture: ComponentFixture<BattleCutInPanelComponent>;
  let component: BattleCutInPanelComponent;
  let hero: GameCharacter;
  let goblin: GameCharacter;
  let mage: GameCharacter;

  function open(role: PeerRole): HTMLElement {
    PeerCursor.myCursor.role = role;
    fixture = TestBed.createComponent(BattleCutInPanelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  /** Lets the change notices the room batches up reach the panel, and draws it again. */
  async function settle(): Promise<void> {
    await waitZeroTimeout();
    fixture.detectChanges();
  }

  const texts = (root: HTMLElement, selector: string) =>
    [...root.querySelectorAll(selector)].map((element) => element.textContent?.replace(/\s+/g, ' ').trim() ?? '');

  beforeEach(() => {
    localStorage.clear();
    PeerCursor.createMyCursor();
    TestBed.configureTestingModule({ imports: [BattleCutInPanelComponent], providers: [...TEST_PROVIDERS] });
    for (const seed of DEFAULT_EFFECT_PRESET_SEEDS) createEffectPreset(seed, seed.identifier);
    hero = GameCharacter.create('勇者', 1, '');
    goblin = GameCharacter.create('ゴブリン', 1, '');
    mage = GameCharacter.create('魔法使い', 1, '');
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    fixture?.destroy();
    Config.instance.battleSettings = DEFAULT_BATTLE_SETTINGS;
    TurnState.instance.currentIdentifier = '';
    await waitZeroTimeout();
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.delete(object, false);
    ObjectStore.instance.clearDeleteHistory();
  });

  it('lists the pieces by the side the master put them on', () => {
    hero.battleSide = 'left';
    goblin.battleSide = 'right';
    const root = open(PeerRole.GameMaster);

    expect(texts(root, '[data-testid="battle-lineup-left"]')[0]).toContain('勇者');
    expect(texts(root, '[data-testid="battle-lineup-right"]')[0]).toContain('ゴブリン');
    expect(texts(root, '[data-testid="battle-lineup-other"]')).toEqual([expect.stringContaining('魔法使い')]);
  });

  it('lets the master put a piece on a side, and follows the change', async () => {
    const root = open(PeerRole.GameMaster);

    root.querySelector<HTMLElement>('[data-testid="battle-to-right-魔法使い"]')!.click();
    await settle();

    expect(mage.battleSide).toBe('right');
    expect(texts(root, '[data-testid="battle-lineup-right"]')[0]).toContain('魔法使い');
  });

  describe('the sides of the parties', () => {
    let heroes: Party;

    beforeEach(() => {
      heroes = new Party();
      heroes.name = '冒険者';
      heroes.initialize();
      hero.partyIdentifier = heroes.identifier;
      mage.partyIdentifier = heroes.identifier;
    });

    it('stands every member put on no side of its own where the master puts its party', async () => {
      goblin.battleSide = 'left';
      mage.battleSide = 'left';
      const root = open(PeerRole.GameMaster);

      root.querySelector<HTMLElement>('[data-testid="battle-party-right-冒険者"]')!.click();
      await settle();

      expect(heroes.battleSide).toBe('right');
      expect(texts(root, '[data-testid="battle-lineup-right"]')[0]).toContain('勇者');
      expect(texts(root, '[data-testid="battle-lineup-left"]')[0]).toContain('魔法使い');
      expect(root.querySelector('[data-testid="battle-with-party-勇者"]')).not.toBeNull();
      expect(root.querySelector('[data-testid="battle-with-party-魔法使い"]')).toBeNull();
    });

    it('keeps a member taken out of the lineup out until it is sent back to its party', async () => {
      heroes.battleSide = 'right';
      const root = open(PeerRole.GameMaster);

      component.setSide(hero.identifier, null);
      await settle();

      expect(texts(root, '[data-testid="battle-lineup-other"]')).toEqual(
        expect.arrayContaining([expect.stringContaining('勇者')])
      );
      root.querySelector<HTMLElement>('[data-testid="battle-follow-party-勇者"]')!.click();
      await settle();

      expect(hero.battleSide).toBe('');
      expect(texts(root, '[data-testid="battle-lineup-right"]')[0]).toContain('勇者');
    });

    it('lets nobody but the master put a party on a side', () => {
      const root = open(PeerRole.Player);

      expect(root.querySelector('[data-testid="battle-party-sides"]')).toBeNull();
      component.setPartySide(heroes.identifier, 'left');
      expect(heroes.battleSide).toBe('');
    });
  });

  it('shows a player the lineup without the means to change it', () => {
    hero.battleSide = 'left';
    const root = open(PeerRole.Player);

    expect(root.querySelector('[data-testid="battle-lineup-other"]')).toBeNull();
    component.setSide(goblin.identifier, 'right');
    expect(goblin.battleSide).toBe('');
  });

  it('says who would strike whom, whose turn it is first', async () => {
    hero.battleSide = 'left';
    goblin.battleSide = 'right';
    mage.battleSide = 'right';
    const root = open(PeerRole.Player);
    expect(texts(root, '[data-testid="battle-cut-in-bout"]')[0]).toContain('勇者 → ゴブリン、魔法使い');

    TurnState.instance.currentIdentifier = mage.identifier;
    await settle();

    expect(texts(root, '[data-testid="battle-cut-in-bout"]')[0]).toContain('魔法使い（手番） → 勇者');
  });

  it('plays the lineup for the room or only here, and only where there is a bout', async () => {
    const launch = TestBed.inject(BattleLaunchService);
    const playLineup = vi.spyOn(launch, 'playLineup').mockReturnValue(null);
    const root = open(PeerRole.Player);
    expect(root.querySelector<HTMLButtonElement>('[data-testid="battle-cut-in-play-room"]')!.disabled).toBe(true);

    hero.battleSide = 'left';
    goblin.battleSide = 'right';
    await settle();
    root.querySelector<HTMLElement>('[data-testid="battle-cut-in-play-room"]')!.click();
    root.querySelector<HTMLElement>('[data-testid="battle-cut-in-play-here"]')!.click();

    expect(playLineup.mock.calls).toEqual([
      [null, 'everywhere'],
      [null, 'here'],
    ]);
  });

  it('lets one who only watches play the lineup on their own screen alone', async () => {
    const playLineup = vi.spyOn(TestBed.inject(BattleLaunchService), 'playLineup').mockReturnValue(null);
    hero.battleSide = 'left';
    goblin.battleSide = 'right';
    const root = open(PeerRole.Guest);

    expect(root.querySelector<HTMLButtonElement>('[data-testid="battle-cut-in-play-room"]')!.disabled).toBe(true);
    expect(root.querySelector('[data-testid="battle-cut-in-watcher-hint"]')).not.toBeNull();
    component.playForRoom();
    root.querySelector<HTMLElement>('[data-testid="battle-cut-in-play-here"]')!.click();

    expect(playLineup.mock.calls).toEqual([[null, 'here']]);
  });

  it('chooses what a piece strikes with', async () => {
    open(PeerRole.Player);

    component.focusOn(goblin.identifier);
    component.setEffect('斬撃');
    await settle();

    expect(goblin.battleEffect).toBe('斬撃');
    expect(component.focusedPreset()?.name).toBe('斬撃');
  });

  it('says which way the picture of a piece faces, for the stage to turn it to face across', async () => {
    const root = open(PeerRole.Player);

    component.focusOn(goblin.identifier);
    await settle();
    const select = root.querySelector<HTMLSelectElement>('[data-testid="battle-facing"]')!;
    select.value = select.options[1].value;
    select.dispatchEvent(new Event('change'));
    await settle();

    expect(goblin.battleFacing).toBe('left');
    expect(component.focused()?.facing).toBe('left');

    component.setFacing('');
    expect(goblin.battleFacing).toBe('');
  });

  it('turns the stage off for this screen alone', () => {
    const root = open(PeerRole.Player);

    root.querySelector<HTMLInputElement>('[data-testid="battle-cut-in-shown"]')!.click();

    expect(TestBed.inject(BattleCutInPreferenceService).shown()).toBe(false);
  });

  it('lets the master alone choose the stage', () => {
    const asPlayer = open(PeerRole.Player);
    expect(asPlayer.querySelector<HTMLButtonElement>('[data-testid="battle-theme-cyberpunk"]')!.disabled).toBe(true);
    component.setTheme('cyberpunk');
    expect(Config.instance.battleSettings.theme).toBe('fantasy-day');
    fixture.destroy();

    const asMaster = open(PeerRole.GameMaster);
    asMaster.querySelector<HTMLButtonElement>('[data-testid="battle-theme-cyberpunk"]')!.click();

    expect(Config.instance.battleSettings.theme).toBe('cyberpunk');
  });

  it('offers every stage by night and by day', () => {
    const root = open(PeerRole.GameMaster);

    const offered = [...root.querySelectorAll<HTMLElement>('[data-testid^="battle-theme-"]')].map(
      (button) => button.dataset['testid']
    );
    expect(offered).toEqual([
      ...['fantasy', 'modern', 'horror', 'cyberpunk', 'mecha'].map((genre) => `battle-theme-${genre}`),
      ...['fantasy', 'modern', 'horror', 'cyberpunk', 'mecha'].map((genre) => `battle-theme-${genre}-day`),
    ]);
  });

  describe('the pictures the room keeps to fight on', () => {
    beforeEach(() => {
      ImageStorage.instance.add({
        identifier: 'arena',
        name: 'arena.webp',
        type: 'image/webp',
        blob: new Blob(['picture'], { type: 'image/webp' }),
        url: 'blob:arena',
        thumbnail: { type: '', blob: null, url: '' },
      });
    });

    afterEach(() => ImageStorage.instance.delete('arena'));

    it('keeps a picture the master adds and fights on it', async () => {
      vi.spyOn(TestBed.inject(ModalService), 'open').mockResolvedValue('arena');
      const root = open(PeerRole.GameMaster);

      root.querySelector<HTMLButtonElement>('[data-testid="battle-picture-add"]')!.click();
      await settle();

      expect(Config.instance.battleSettings).toMatchObject({ pictures: ['arena'], background: 'arena' });
      const tile = root.querySelector<HTMLButtonElement>('[data-testid="battle-picture-arena"]')!;
      expect(tile.getAttribute('aria-checked')).toBe('true');
      expect(tile.querySelector('img')!.getAttribute('src')).toBe('blob:arena');
      expect(root.querySelector('[data-testid="battle-theme-fantasy-day"]')!.getAttribute('aria-checked')).toBe(
        'false'
      );
    });

    it('goes back to the stage chosen when the master picks one of the tool’s own or lets the picture go', () => {
      Config.instance.battleSettings = {
        ...DEFAULT_BATTLE_SETTINGS,
        theme: 'horror',
        pictures: ['arena'],
        background: 'arena',
      };
      const root = open(PeerRole.GameMaster);

      root.querySelector<HTMLButtonElement>('[data-testid="battle-theme-mecha-day"]')!.click();
      expect(Config.instance.battleSettings).toMatchObject({ theme: 'mecha-day', background: '', pictures: ['arena'] });

      component.setPicture('arena');
      root.querySelector<HTMLButtonElement>('[data-testid="battle-picture-remove-arena"]')!.click();
      expect(Config.instance.battleSettings).toMatchObject({ theme: 'mecha-day', background: '', pictures: [] });
    });

    it('lets nobody but the master add, choose or let go a picture', () => {
      Config.instance.battleSettings = { ...DEFAULT_BATTLE_SETTINGS, pictures: ['arena'] };
      const modal = vi.spyOn(TestBed.inject(ModalService), 'open');
      const root = open(PeerRole.Player);

      expect(root.querySelector<HTMLButtonElement>('[data-testid="battle-picture-add"]')!.disabled).toBe(true);
      expect(root.querySelector<HTMLButtonElement>('[data-testid="battle-picture-arena"]')!.disabled).toBe(true);
      expect(root.querySelector('[data-testid="battle-picture-remove-arena"]')).toBeNull();
      component.addPicture();
      component.setPicture('arena');
      component.removePicture('arena');

      expect(modal).not.toHaveBeenCalled();
      expect(Config.instance.battleSettings).toMatchObject({ pictures: ['arena'], background: '' });
    });

    it('adds no more once the room keeps as many as it may', () => {
      const many = Array.from({ length: BATTLE_PICTURE_LIMIT }, (_, index) => `picture-${index}`);
      Config.instance.battleSettings = { ...DEFAULT_BATTLE_SETTINGS, pictures: many };
      const root = open(PeerRole.GameMaster);

      expect(root.querySelector<HTMLButtonElement>('[data-testid="battle-picture-add"]')!.disabled).toBe(true);
    });
  });

  it('lets the master alone set how a fighter goes down', () => {
    const asPlayer = open(PeerRole.Player);
    expect(asPlayer.querySelector<HTMLInputElement>('[data-testid="battle-defeat"]')!.disabled).toBe(true);
    component.setDefeatResource('生命力');
    expect(Config.instance.battleSettings.defeatResource).toBe('HP');
    fixture.destroy();

    const asMaster = open(PeerRole.GameMaster);
    component.setDefeatResource('生命力');
    asMaster.querySelector<HTMLInputElement>('[data-testid="battle-defeat"]')!.click();

    expect(Config.instance.battleSettings).toMatchObject({ defeatResource: '生命力', defeat: false });
  });
});
