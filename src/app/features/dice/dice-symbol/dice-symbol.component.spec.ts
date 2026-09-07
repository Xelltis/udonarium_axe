import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { ViewModePreferenceService } from '@axe/application/ui/view-mode-preference.service';
import { IPeerContext } from '@axe/core/network/peer-context';
import { setPeerContextProvider } from '@axe/core/network/peer-context-source';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { DiceSymbol } from '@axe/domain/dice/dice-symbol';
import { DiceSymbolComponent } from '@axe/features/dice/dice-symbol/dice-symbol.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

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
      const before = component.billboardTransform();

      ui.notifyTableViewRotation(60, 20, 120);
      const after = component.billboardTransform();

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

      expect(component.billboardTransform()).toContain('rotateZ(-45deg)');
    });

    it('sets the owners name further out than the dies own', () => {
      const diceSymbol = DiceSymbol.create('オフセットテスト', 1, 1);
      fixture.componentRef.setInput('diceSymbol', diceSymbol);
      TestBed.inject(UiSignalService).notifyTableViewRotation(50, 0, 10);

      const match = (s: string) => Number(s.match(/translateZ\((-?[\d.]+)px\)/)?.[1] ?? 0);
      expect(match(component.billboardTransformOwner())).toBeLessThan(match(component.billboardTransform()));
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

      expect(component.billboardTransformImage()).toContain('translateZ(0.00px)');
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
      expect(component.nameLabelOrbit()).toBe('translateY(-30px)');
    });

    it('puts it up the screen in the flat mode', async () => {
      const diceSymbol = DiceSymbol.create('orbit2dテスト', 1, 1);
      fixture.componentRef.setInput('diceSymbol', diceSymbol);
      TestBed.inject(ViewModePreferenceService).choose('flat');
      TestBed.inject(UiSignalService).notifyTableViewRotation(0, 0, 0);
      await new Promise<void>((resolve) => queueMicrotask(resolve));
      const transform = component.nameLabelOrbit();
      expect(transform).toContain('translateZ(-60.00px)');
    });

    it('keeps that offset the larger of the two', async () => {
      const diceSymbol = DiceSymbol.create('orbit比較テスト', 1, 1);
      fixture.componentRef.setInput('diceSymbol', diceSymbol);
      TestBed.inject(ViewModePreferenceService).choose('flat');
      TestBed.inject(UiSignalService).notifyTableViewRotation(0, 0, 0);
      await new Promise<void>((resolve) => queueMicrotask(resolve));
      const nameZ = Math.abs(Number(component.nameLabelOrbit().match(/translateZ\((-?[\d.]+)px\)/)?.[1] ?? 0));
      const ownerZ = Math.abs(Number(component.ownerLabelOrbit().match(/translateZ\((-?[\d.]+)px\)/)?.[1] ?? 0));
      expect(ownerZ).toBeGreaterThan(nameZ);
    });

    it('compensates nothing along the depth in the flat mode', async () => {
      const diceSymbol = DiceSymbol.create('compZテスト', 1, 1);
      fixture.componentRef.setInput('diceSymbol', diceSymbol);
      TestBed.inject(ViewModePreferenceService).choose('flat');
      TestBed.inject(UiSignalService).notifyTableViewRotation(50, 0, 10);
      await new Promise<void>((resolve) => queueMicrotask(resolve));
      expect(component.billboardTransform()).toContain('translateZ(0.00px)');
      expect(component.billboardTransformOwner()).toContain('translateZ(0.00px)');
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

  describe('opening a die that was somebody’s alone', () => {
    let tab: ChatTab;
    let dice: DiceSymbol;

    beforeEach(() => {
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
