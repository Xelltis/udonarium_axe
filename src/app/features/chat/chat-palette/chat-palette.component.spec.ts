import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CharacterMacroService } from '@axe/application/chat/character-macro.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { childrenChanged$ } from '@axe/core/sync/object-event-extension';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { ChatPaletteComponent } from '@axe/features/chat/chat-palette/chat-palette.component';
import { expectPanelDragRecovery, PanelDragTestHostComponent } from '@axe/testing/panel-drag-recovery';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import GameSystemClass from 'bcdice/lib/game_system';

describe('ChatPaletteComponent', () => {
  let component: ChatPaletteComponent;
  let fixture: ComponentFixture<ChatPaletteComponent>;
  const createdChars: GameCharacter[] = [];

  beforeEach(async () => {
    PeerCursor.createMyCursor();
    TestBed.configureTestingModule({
      imports: [ChatPaletteComponent, PanelDragTestHostComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ChatPaletteComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    for (const char of createdChars) {
      ObjectStore.instance.remove(char);
    }
    createdChars.length = 0;
    // The tab list outlives the fixture, so a tab left behind turns up in whatever runs next.
    for (const tab of [...ChatTabList.instance.chatTabs]) tab.destroy();
  });

  function createChar(name: string): GameCharacter {
    const char = GameCharacter.create(name, 1, '');
    createdChars.push(char);
    return char;
  }

  it('should be created', () => {
    expect(component).toBeTruthy();
  });

  it('lets the panel take the pointer again once the drag ends', async () => {
    await expectPanelDragRecovery(ChatPaletteComponent, {
      beforeOpen: () => {
        if (ChatTabList.instance.chatTabs.length < 1) {
          ChatTabList.instance.addChatTab('テストタブ');
        }
      },
      initialize: (opened) => {
        opened.character.set(createChar('テスト'));
      },
    });
  });

  describe('chatTabsVersion signal', () => {
    it('exposes the tab version as a computed signal', () => {
      expect(typeof component.chatTabsVersion).toBe('function');
    });

    it('returns the tabs from it', () => {
      fixture.detectChanges();
      const tabs = component.chatTabsVersion();
      expect(Array.isArray(tabs)).toBe(true);
    });

    it('bumps the version when the children change', () => {
      fixture.detectChanges();
      const objectChange = TestBed.inject(ObjectChangeService);
      const tabs = component.chatTabsVersion();
      if (tabs.length === 0) return;

      const tabId = tabs[0].identifier;
      const before = objectChange.versionOf(tabId)();

      childrenChanged$.emit({ identifier: tabId });

      expect(objectChange.versionOf(tabId)()).toBe(before + 1);
    });
  });

  describe('speaking a line', () => {
    it('carries the bubble the sender picked, as the chat window does', () => {
      const speaker = createChar('術者');
      const tab = ChatTabList.instance.addChatTab('テストタブ');
      component.character.set(speaker);
      component.chatTabidentifier.set(tab.identifier);
      const send = vi.spyOn(TestBed.inject(CharacterMacroService), 'send').mockReturnValue(null);

      component.sendChat({
        text: 'こんにちは',
        gameSystem: null as unknown as GameSystemClass,
        sendFrom: speaker.identifier,
        sendTo: '',
        portraitIndex: 0,
        messColor: '#112233',
        messBubbleLight: '#ffeeee',
        messBubbleDark: '#332211',
        replyTo: '',
        quoteOf: '',
        toTicker: false,
      });

      expect(send.mock.calls[0][2]).toEqual(
        expect.objectContaining({ bubbles: { light: '#ffeeee', dark: '#332211' } })
      );
    });
  });

  describe('the menu on a palette line', () => {
    function press(kind: 'command' | 'heading' | 'variable'): MouseEvent {
      const event = new MouseEvent('contextmenu', { clientX: 10, clientY: 10, cancelable: true });
      vi.spyOn(event, 'preventDefault');
      component.onPaletteRowMenu({ text: '2d6+3 攻撃', kind, lineIndex: 0 }, event);
      return event;
    }

    it('offers a line that is actually said', () => {
      const open = vi.spyOn(TestBed.inject(ContextMenuService), 'open').mockImplementation(() => undefined);

      press('command');

      expect(open).toHaveBeenCalled();
    });

    it('leaves a heading or a setting line to the browser', () => {
      const open = vi.spyOn(TestBed.inject(ContextMenuService), 'open').mockImplementation(() => undefined);

      const heading = press('heading');
      const variable = press('variable');

      expect(open).not.toHaveBeenCalled();
      expect(heading.preventDefault).not.toHaveBeenCalled();
      expect(variable.preventDefault).not.toHaveBeenCalled();
    });

    it('leaves the browser its own menu for a guest, who is offered nothing', () => {
      vi.spyOn(TestBed.inject(RolePermissionService), 'canEditTabletop', 'get').mockReturnValue(false);
      const open = vi.spyOn(TestBed.inject(ContextMenuService), 'open').mockImplementation(() => undefined);

      const event = press('command');

      expect(open).not.toHaveBeenCalled();
      expect(event.preventDefault).not.toHaveBeenCalled();
    });
  });
});
