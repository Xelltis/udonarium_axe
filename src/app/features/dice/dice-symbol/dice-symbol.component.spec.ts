import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { PieceMotionsService } from '@axe/application/tabletop/piece-motions.service';
import { ContextMenuAction, ContextMenuService } from '@axe/application/ui/context-menu.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { PieceContextMenuService } from '@axe/application/ui/piece-context-menu.service';
import { IPeerContext } from '@axe/core/network/peer-context';
import { setPeerContextProvider } from '@axe/core/network/peer-context-source';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { DiceSymbol } from '@axe/domain/dice/dice-symbol';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { DiceSymbolComponent } from '@axe/features/dice/dice-symbol/dice-symbol.component';
import { DiceSymbolSheetComponent } from '@axe/features/dice/dice-symbol-sheet/dice-symbol-sheet.component';
import { beMyself } from '@axe/testing/peer-context-stub';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('DiceSymbolComponent', () => {
  let component: DiceSymbolComponent;
  let given: { destroy(): void };
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
    // Given its piece at once, as a template gives it, so that no drawing of the page made before a
    // test gives its own reads the required input unset.
    given = DiceSymbol.create('D6', 0, 1);
    fixture.componentRef.setInput('diceSymbol', given);
  });

  afterEach(() => given.destroy());

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

  it('bounces onto the canvas as it comes onto the table', () => {
    const play = vi.spyOn(TestBed.inject(PieceMotionsService), 'play');
    const die = DiceSymbol.create('D6', 0, 1);
    fixture.componentRef.setInput('diceSymbol', die);
    fixture.detectChanges();
    TestBed.tick();

    expect(play).toHaveBeenCalledWith(die.identifier, 'bounce-in');
    vi.restoreAllMocks();
    die.destroy();
  });

  it('opens the die’s own sheet from “show details” in its menu', async () => {
    const die = DiceSymbol.create('D6', 0, 1);
    fixture.componentRef.setInput('diceSymbol', die);
    fixture.detectChanges();
    vi.spyOn(TestBed.inject(PieceContextMenuService), 'openForSelection').mockReturnValue(false);
    const open = vi.spyOn(TestBed.inject(ContextMenuService), 'open').mockImplementation(() => undefined);
    const openLazy = vi.spyOn(TestBed.inject(PanelService), 'openLazy').mockImplementation(() => undefined);
    TestBed.inject(PointerDeviceService).primeForContextMenu(240, 180);

    try {
      component.onContextMenu(new Event('contextmenu', { cancelable: true }));
      const menu = open.mock.calls[0][1] as ContextMenuAction[];
      menu.find((entry) => entry.name === '詳細を表示')!.action!();

      expect(openLazy).toHaveBeenCalledOnce();
      const [load, , setUp] = openLazy.mock.calls[0];
      expect(await load()).toBe(DiceSymbolSheetComponent);
      const sheet = { diceSymbol: null as DiceSymbol | null };
      setUp!(sheet as never);
      expect(sheet.diceSymbol).toBe(die);
    } finally {
      vi.restoreAllMocks();
      die.destroy();
    }
  });

  describe('signal-driven CD', () => {
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
      vi.spyOn(TestBed.inject(RolePermissionService), 'canSeeHidden').mockReturnValue(true);

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
      const callOut = vi.spyOn(chat, 'sendSystemNotice');

      reveal('6');

      expect(callOut).not.toHaveBeenCalled();
    });

    it('calls the face out where there is no throw of it to open', () => {
      // A face set by hand leaves nothing in the log, so the call-out is the only record.
      const callOut = vi.spyOn(TestBed.inject(ChatMessageService), 'sendSystemNotice');

      reveal('6');

      expect(callOut).toHaveBeenCalledOnce();
      expect(callOut.mock.calls[0][0]).toBe('diceReveal');
      expect(callOut.mock.calls[0][1]).toContain('6');
    });

    it('calls the face out where the throw it found is somebody else to open', () => {
      const chat = TestBed.inject(ChatMessageService);
      const secret = chat.sendSecretSystemMessageToTab(tab, '隠しダイス → 6', 'somebody-else', undefined, [
        dice.identifier,
      ]);
      const callOut = vi.spyOn(chat, 'sendSystemNotice');

      reveal('6');

      expect(secret.isSecret).toBe(true);
      expect(callOut).toHaveBeenCalledOnce();
      expect(callOut.mock.calls[0][1]).toContain('6');
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
    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    it('tumbles the die’s picture on the canvas on word of a throw', () => {
      const play = vi.spyOn(TestBed.inject(PieceMotionsService), 'play');
      const dice = rollFrom();

      expect(play).toHaveBeenCalledWith(dice.identifier, expect.stringMatching(/^dice-tumble-/), {
        parts: ['picture'],
      });
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
      const play = vi.spyOn(TestBed.inject(PieceMotionsService), 'play');
      const dice = rollFrom();

      TestBed.inject(ObjectChangeService).notifyDiceRolled(dice.identifier);

      const tumbles = play.mock.calls.filter(([, kind]) => kind.startsWith('dice-tumble-')).map(([, kind]) => kind);
      expect(tumbles).toHaveLength(2);
      expect(tumbles[1]).not.toBe(tumbles[0]);
      dice.destroy();
    });
  });
});
