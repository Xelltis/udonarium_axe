import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { BillboardFacing, BillboardFrameService } from '@axe/application/ui/billboard-frame.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { ViewModePreferenceService } from '@axe/application/ui/view-mode-preference.service';
import { IPeerContext } from '@axe/core/network/peer-context';
import { setPeerContextProvider } from '@axe/core/network/peer-context-source';
import { ImageFile } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { DiceSymbol } from '@axe/domain/dice/dice-symbol';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { DiceSymbolComponent } from '@axe/features/dice/dice-symbol/dice-symbol.component';
import { beMyself } from '@axe/testing/peer-context-stub';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

/** What a facing writes at the turn the table has been given, which is what the frame writes out. */
function at(facing: BillboardFacing): string {
  return facing(TestBed.inject(UiSignalService).tableViewRotation());
}

describe('DiceSymbolComponent', () => {
  let component: DiceSymbolComponent;
  let fixture: ComponentFixture<DiceSymbolComponent>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [DiceSymbolComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(DiceSymbolComponent);
    component = fixture.componentInstance;
  });

  const useFlatTable = () => {
    const table = TestBed.inject(TabletopService).currentTable;
    TestBed.inject(ViewModePreferenceService).choose('auto');
    table.imageBillboard = false;
  };

  beforeEach(useFlatTable);
  afterEach(useFlatTable);

  it('blacks a die out the moment it is kept back, without it being moved', async () => {
    // The mask on the picture is what the table sees. Nothing else drawn on the die may move
    // with the claim, or that would answer the question instead: the name label is held back so
    // it stays put whether the face is on show or not.
    const die = DiceSymbol.create('D6', 0, 1);
    die.hideName = true;
    // The mask sits on the picture of the face, so the die has to be wearing one.
    ImageStorage.instance.add(
      ImageFile.create({
        identifier: 'die-face',
        name: 'die-face',
        type: 'image/png',
        blob: null,
        url: './assets/images/test-die.png',
        thumbnail: { type: '', blob: null, url: '' },
      })
    );
    const face = die.imageDataElement?.getFirstElementByName(die.face);
    if (face) face.value = 'die-face';
    fixture.componentRef.setInput('diceSymbol', die);
    fixture.detectChanges();
    const masked = () => (fixture.nativeElement as HTMLElement).querySelectorAll('img.is-black-mask').length;
    expect(masked()).toBe(0);

    // Nothing is checked by hand from here on: the mask has to follow because the signals said
    // so. A forced check would pass either way.
    die.owner = 'somebody-else';
    TestBed.inject(ObjectChangeService).notifyChanged(die.identifier);
    await fixture.whenStable();

    expect(masked()).toBeGreaterThan(0);

    // Opening it again is the same question the other way round: the mask has to come off
    // without the die being dragged either.
    die.owner = '';
    TestBed.inject(ObjectChangeService).notifyChanged(die.identifier);
    await fixture.whenStable();

    expect(masked()).toBe(0);
    die.destroy();
  });

  it('reads the face and the owner through the signals rather than off the die', () => {
    const die = DiceSymbol.create('D6', 0, 1);
    die.owner = 'somebody-else';
    const holder = new PeerCursor();
    holder.userId = 'somebody-else';
    holder.name = '持ち主';
    holder.initialize();
    fixture.componentRef.setInput('diceSymbol', die);
    const objectChange = TestBed.inject(ObjectChangeService);
    const versionOf = objectChange.versionOf.bind(objectChange);
    const read: string[] = [];
    Object.defineProperty(objectChange, 'versionOf', {
      value: (identifier: string) => {
        read.push(identifier);
        return versionOf(identifier);
      },
      configurable: true,
    });
    const readsTheDie = (value: () => unknown): boolean => {
      read.length = 0;
      value();
      return read.includes(die.identifier);
    };

    expect(readsTheDie(() => component.isVisible())).toBe(true);
    expect(readsTheDie(() => component.isMine())).toBe(true);
    expect(readsTheDie(() => component.hasOwner())).toBe(true);
    expect(readsTheDie(() => component.ownerName())).toBe(true);
    expect(read).toContain(holder.identifier);

    holder.destroy();
    die.destroy();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('signal-driven CD', () => {
    it('holds the animation state in a signal', () => {
      expect(typeof component.animeState).toBe('function');
      expect(component.animeState()).toBe('inactive');
    });

    it('reads the name through the network version', () => {
      const diceSymbol = DiceSymbol.create('テストダイス', 1, 1);
      fixture.componentRef.setInput('diceSymbol', diceSymbol);
      const objectChangeService = TestBed.inject(ObjectChangeService);
      const original = objectChangeService.networkVersion;
      const spy = vi.fn(() => original());
      Object.defineProperty(objectChangeService, 'networkVersion', { value: spy, configurable: true });
      void component.name();
      expect(spy).toHaveBeenCalled();
    });

    it('holds the hidden icon in a signal', () => {
      expect(typeof component.isIconHidden).toBe('function');
      expect(component.isIconHidden()).toBe(false);
    });
  });

  describe('following the camera', () => {
    it('rebuilds the transform as the view turns', () => {
      const diceSymbol = DiceSymbol.create('ビルボードテスト', 1, 1);
      fixture.componentRef.setInput('diceSymbol', diceSymbol);
      const ui = TestBed.inject(UiSignalService);

      ui.notifyTableViewRotation(50, 0, 10);
      const before = at(component.nameFacing());

      ui.notifyTableViewRotation(60, 20, 120);
      const after = at(component.nameFacing());

      expect(before).not.toBe(after);
      expect(after).toContain('rotateZ(-120deg)');
      expect(after).toContain('rotateX(-60deg)');
      expect(after).toContain('rotateY(-20deg)');
    });

    it('undoes the turn of the die itself', () => {
      const diceSymbol = DiceSymbol.create('rotateテスト', 1, 1);
      diceSymbol.rotate = 45;
      fixture.componentRef.setInput('diceSymbol', diceSymbol);
      TestBed.inject(UiSignalService).notifyTableViewRotation(50, 0, 10);

      expect(at(component.nameFacing())).toContain('rotateZ(-45deg)');
    });

    it('sets the owners name further out than the dies own', () => {
      const diceSymbol = DiceSymbol.create('オフセットテスト', 1, 1);
      fixture.componentRef.setInput('diceSymbol', diceSymbol);
      TestBed.inject(UiSignalService).notifyTableViewRotation(50, 0, 10);

      const match = (s: string) => Number(s.match(/translateZ\((-?[\d.]+)px\)/)?.[1] ?? 0);
      expect(match(at(component.ownerFacing()))).toBeLessThan(match(at(component.nameFacing())));
    });

    it('takes the setting from the table', async () => {
      const diceSymbol = DiceSymbol.create('画像追従テスト', 1, 1);
      fixture.componentRef.setInput('diceSymbol', diceSymbol);
      const tabletopService = TestBed.inject(TabletopService);

      tabletopService.currentTable.imageBillboard = false;
      expect(component.imageBillboardEnabled()).toBe(false);

      tabletopService.currentTable.imageBillboard = true;
      await new Promise<void>((resolve) => queueMicrotask(resolve));
      expect(component.imageBillboardEnabled()).toBe(true);
    });

    it('faces the picture at the camera without raising it', () => {
      const diceSymbol = DiceSymbol.create('画像オフセットテスト', 1, 1);
      fixture.componentRef.setInput('diceSymbol', diceSymbol);
      TestBed.inject(UiSignalService).notifyTableViewRotation(50, 0, 10);

      expect(at(component.imageFacing())).toContain('translateZ(0.00px)');
    });

    it('is turned by the frame without the die working its labels out again', async () => {
      const diceSymbol = DiceSymbol.create('フレームテスト', 1, 1);
      fixture.componentRef.setInput('diceSymbol', diceSymbol);
      fixture.detectChanges();
      await fixture.whenStable();
      const frame = TestBed.inject(BillboardFrameService);
      const ui = TestBed.inject(UiSignalService);
      const facing = component.nameFacing();
      const plate = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('[data-testid="dice-name"]')!;

      for (let turn = 0; turn < 10; turn++) {
        ui.notifyTableViewRotation(50, 0, turn * 12);
        frame.apply({ x: 50, y: 0, z: turn * 12 });
      }

      expect(component.nameFacing()).toBe(facing);
      expect(plate.style.transform).toBe(facing({ x: 50, y: 0, z: 108 }));
    });

    it('faces it anyway in the flat mode', async () => {
      const diceSymbol = DiceSymbol.create('mode2dテスト', 1, 1);
      fixture.componentRef.setInput('diceSymbol', diceSymbol);
      const tabletopService = TestBed.inject(TabletopService);

      tabletopService.currentTable.imageBillboard = false;
      TestBed.inject(ViewModePreferenceService).choose('flat');
      await new Promise<void>((resolve) => queueMicrotask(resolve));
      expect(component.imageBillboardEnabled()).toBe(true);
    });
  });

  describe('keeping the name above the piece on the screen in the flat mode', () => {
    it('raises the name straight up in three dimensions', async () => {
      const diceSymbol = DiceSymbol.create('orbit3dテスト', 1, 1);
      fixture.componentRef.setInput('diceSymbol', diceSymbol);
      TestBed.inject(ViewModePreferenceService).choose('auto');
      await new Promise<void>((resolve) => queueMicrotask(resolve));
      expect(at(component.nameOrbitFacing())).toBe('translateX(-50%) translateX(25px) translateY(-30px)');
    });

    it('puts it up the screen in the flat mode', async () => {
      const diceSymbol = DiceSymbol.create('orbit2dテスト', 1, 1);
      fixture.componentRef.setInput('diceSymbol', diceSymbol);
      TestBed.inject(ViewModePreferenceService).choose('flat');
      TestBed.inject(UiSignalService).notifyTableViewRotation(0, 0, 0);
      await new Promise<void>((resolve) => queueMicrotask(resolve));
      const transform = at(component.nameOrbitFacing());
      expect(transform).toContain('translateZ(-60.00px)');
    });

    it('keeps that offset the larger of the two', async () => {
      const diceSymbol = DiceSymbol.create('orbit比較テスト', 1, 1);
      fixture.componentRef.setInput('diceSymbol', diceSymbol);
      TestBed.inject(ViewModePreferenceService).choose('flat');
      TestBed.inject(UiSignalService).notifyTableViewRotation(0, 0, 0);
      await new Promise<void>((resolve) => queueMicrotask(resolve));
      const nameZ = Math.abs(Number(at(component.nameOrbitFacing()).match(/translateZ\((-?[\d.]+)px\)/)?.[1] ?? 0));
      const ownerZ = Math.abs(Number(at(component.ownerOrbitFacing()).match(/translateZ\((-?[\d.]+)px\)/)?.[1] ?? 0));
      expect(ownerZ).toBeGreaterThan(nameZ);
    });

    it('compensates nothing along the depth in the flat mode', async () => {
      const diceSymbol = DiceSymbol.create('compZテスト', 1, 1);
      fixture.componentRef.setInput('diceSymbol', diceSymbol);
      TestBed.inject(ViewModePreferenceService).choose('flat');
      TestBed.inject(UiSignalService).notifyTableViewRotation(50, 0, 10);
      await new Promise<void>((resolve) => queueMicrotask(resolve));
      expect(at(component.nameFacing())).toContain('translateZ(0.00px)');
      expect(at(component.ownerFacing())).toContain('translateZ(0.00px)');
    });
  });

  describe('timer cleanup on destroy', () => {
    it('clears the double-tap timer', () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
      const priv = component as unknown as { doubleClickTimer: ReturnType<typeof setTimeout> | null };
      priv.doubleClickTimer = setTimeout(() => {}, 999_999);

      fixture.destroy();

      expect(clearTimeoutSpy).toHaveBeenCalled();
    });

    it('clears the icon timer', () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
      const priv = component as unknown as { iconHiddenTimer: ReturnType<typeof setTimeout> | null };
      priv.iconHiddenTimer = setTimeout(() => {}, 999_999);

      fixture.destroy();

      expect(clearTimeoutSpy).toHaveBeenCalled();
    });
  });

  describe('the name of a die that is somebody’s alone', () => {
    const created: DiceSymbol[] = [];

    function beMe(userId: string): void {
      const me = { userId } as IPeerContext;
      setPeerContextProvider({ peerContext: me, peerContexts: [me], peerIds: [userId], peerId: userId });
    }

    function show(owner: string): DiceSymbol {
      const dice = DiceSymbol.create('切り札', 1, 1);
      dice.owner = owner;
      created.push(dice);
      fixture.componentRef.setInput('diceSymbol', dice);
      fixture.detectChanges();
      return dice;
    }

    afterEach(() => {
      for (const dice of created.splice(0)) dice.destroy();
    });

    it('is kept from whoever may not read the face', () => {
      beMe('me');

      show('somebody-else');

      expect(component.hideName()).toBe(true);
      expect(fixture.nativeElement.textContent).not.toContain('切り札');
    });

    it('is shown to the one it belongs to', () => {
      beMe('me');

      show('me');

      expect(component.hideName()).toBe(false);
      expect(fixture.nativeElement.textContent).toContain('切り札');
    });

    it('is shown to the game master', () => {
      beMe('me');
      vi.spyOn(TestBed.inject(RolePermissionService), 'canSeeHidden', 'get').mockReturnValue(true);

      show('somebody-else');

      expect(component.hideName()).toBe(false);
      expect(fixture.nativeElement.textContent).toContain('切り札');
    });

    it('is shown on a die nobody has kept back', () => {
      beMe('me');

      show('');

      expect(component.hideName()).toBe(false);
      expect(fixture.nativeElement.textContent).toContain('切り札');
    });
  });

  describe('a die marked as spent', () => {
    let dice: DiceSymbol;

    beforeEach(() => {
      dice = DiceSymbol.create('テストダイス', 1, 1);
      fixture.componentRef.setInput('diceSymbol', dice);
    });

    afterEach(() => dice.destroy());

    const dimmed = async (): Promise<number> => {
      fixture.detectChanges();
      await fixture.whenStable();
      return (fixture.nativeElement as HTMLElement).querySelectorAll('.is-used').length;
    };

    it('is drawn no darker while it is still to be used', async () => {
      expect(await dimmed()).toBe(0);
    });

    it('is darkened once it is marked', async () => {
      dice.isUsed = true;

      expect(await dimmed()).toBeGreaterThan(0);
    });

    it('comes back to itself when the mark is taken off', async () => {
      dice.isUsed = true;
      expect(await dimmed()).toBeGreaterThan(0);

      dice.isUsed = false;

      expect(await dimmed()).toBe(0);
    });
  });

  describe('opening a die that was somebody’s alone', () => {
    let tab: ChatTab;
    let dice: DiceSymbol;

    beforeEach(() => {
      beMyself('me');
      tab = ChatTabList.instance.addChatTab('テストタブ');
      dice = DiceSymbol.create('隠しダイス', 1, 1);
      fixture.componentRef.setInput('diceSymbol', dice);
    });

    afterEach(() => {
      dice.destroy();
      tab.destroy();
    });

    function reveal(face: string): void {
      (component as unknown as { onDiceRevealed(face: string): void }).onDiceRevealed(face);
    }

    it('opens the secret line it was thrown on', () => {
      const chat = TestBed.inject(ChatMessageService);
      const secret = chat.sendSecretSystemMessageToTab(tab, '隠しダイス → 6', 'me', undefined, [dice.identifier]);

      reveal('6');

      expect(secret.isSecret).toBe(false);
    });

    it('leaves the throw of another die kept back', () => {
      const chat = TestBed.inject(ChatMessageService);
      const other = chat.sendSecretSystemMessageToTab(tab, 'べつのダイス → 1', 'me', undefined, ['another-die']);

      reveal('6');

      expect(other.isSecret).toBe(true);
    });

    it('says nothing more of its own once the throw it opened carries the face', () => {
      const chat = TestBed.inject(ChatMessageService);
      chat.sendSecretSystemMessageToTab(tab, '隠しダイス → 6', 'me', undefined, [dice.identifier]);
      const callOut = vi.spyOn(chat, 'sendSystemMessageToMainTab');

      reveal('6');

      expect(callOut).not.toHaveBeenCalled();
    });

    it('calls the face out where there is no throw of it to open', () => {
      // A face set by hand leaves nothing in the log, so the call-out is the only record.
      const callOut = vi.spyOn(TestBed.inject(ChatMessageService), 'sendSystemMessageToMainTab');

      reveal('6');

      expect(callOut).toHaveBeenCalledOnce();
      expect(callOut.mock.calls[0][0]).toContain('6');
    });

    it('calls the face out where the throw it found is somebody else to open', () => {
      const chat = TestBed.inject(ChatMessageService);
      const secret = chat.sendSecretSystemMessageToTab(tab, '隠しダイス → 6', 'somebody-else', undefined, [
        dice.identifier,
      ]);
      const callOut = vi.spyOn(chat, 'sendSystemMessageToMainTab');

      reveal('6');

      expect(secret.isSecret).toBe(true);
      expect(callOut).toHaveBeenCalledOnce();
      expect(callOut.mock.calls[0][0]).toContain('6');
    });
  });

  describe('the throw', () => {
    function rollFrom(): DiceSymbol {
      const dice = DiceSymbol.create('テストダイス', 1, 1);
      fixture.componentRef.setInput('diceSymbol', dice);
      fixture.detectChanges();
      TestBed.inject(ObjectChangeService).notifyDiceRolled(dice.identifier);
      return dice;
    }

    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('rolls the die on word of a throw', () => {
      const dice = rollFrom();

      vi.advanceTimersByTime(1);

      expect(component.animeState()).toBe('active');
      dice.destroy();
    });

    it('calls nothing out while the die is still rolling', () => {
      // Shown mid-roll it would give the face away before the die does.
      const dice = rollFrom();

      vi.advanceTimersByTime(700);

      expect(component.rollResult()).toBeNull();
      dice.destroy();
    });

    it('calls the face out once it settles', () => {
      const dice = rollFrom();
      dice.face = '5';

      vi.advanceTimersByTime(800);

      expect(component.rollResult()).toBe('5');
      dice.destroy();
    });

    it('takes the callout away again', () => {
      const dice = rollFrom();

      vi.advanceTimersByTime(800 + 1300);

      expect(component.rollResult()).toBeNull();
      dice.destroy();
    });

    it('calls nothing out for a die nobody may see', () => {
      const dice = rollFrom();
      dice.owner = 'somebody-else';

      vi.advanceTimersByTime(800);

      expect(component.rollResult()).toBeNull();
      dice.destroy();
    });

    it('takes another path than the throw before it', () => {
      // A handful thrown together should not roll as one.
      const dice = rollFrom();
      const first = component.tumble();

      TestBed.inject(ObjectChangeService).notifyDiceRolled(dice.identifier);

      expect(component.tumble()).not.toBe(first);
      dice.destroy();
    });
  });
});
