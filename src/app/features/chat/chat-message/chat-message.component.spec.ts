import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChatBookmarkService } from '@axe/application/chat/chat-bookmark.service';
import { ChatPreferencesService } from '@axe/application/chat/chat-preferences.service';
import { ChatReactionService } from '@axe/application/chat/chat-reaction.service';
import { ChatTickerSelectionService } from '@axe/application/chat/chat-ticker-selection.service';
import {
  DEFAULT_SYSTEM_AVATAR_URL,
  DEFAULT_SYSTEM_DICE_AVATAR_URL,
  NO_SYSTEM_AVATAR,
  SystemAvatarService,
} from '@axe/application/chat/system-avatar.service';
import { encodeI18nMessage } from '@axe/application/i18n/i18n-message';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { TabletopDisplayService } from '@axe/application/tabletop/tabletop-display.service';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { ContextMenuAction, ContextMenuService } from '@axe/application/ui/context-menu.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { ViewModePreferenceService } from '@axe/application/ui/view-mode-preference.service';
import { ViewportService } from '@axe/application/ui/viewport.service';
import { emitFileLoaded } from '@axe/core/event/domain-events';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { ChatReaction } from '@axe/domain/chat/chat-reaction';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { TextNote } from '@axe/domain/tabletop/text-note';
import { ChatMessageComponent } from '@axe/features/chat/chat-message/chat-message.component';
import { StampPickerService } from '@axe/features/chat/stamp/stamp-picker.service';
import { beMyself } from '@axe/testing/peer-context-stub';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import type { MockInstance } from 'vitest';

describe('ChatMessageComponent', () => {
  let component: ChatMessageComponent;
  let fixture: ComponentFixture<ChatMessageComponent>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [ChatMessageComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ChatMessageComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  /**
   * The menu a button on the toolbar over the line opens, as handed to the context menu, or none
   * where the toolbar or the button is not there.
   */
  function menuFrom(button: 'more' | 'bookmark'): ContextMenuAction[] {
    const open = vi.spyOn(TestBed.inject(ContextMenuService), 'open').mockImplementation(() => undefined);
    try {
      const host = fixture.nativeElement as HTMLElement;
      host.querySelector<HTMLElement>(`[data-testid="chat-message-action-${button}"]`)?.click();
      return open.mock.calls.at(-1)?.[1] ?? [];
    } finally {
      open.mockRestore();
    }
  }

  /** The item of a menu by the key of its name, or undefined where the menu does not offer it. */
  function itemOf(actions: readonly ContextMenuAction[], key: string): ContextMenuAction | undefined {
    const name = TestBed.inject(TRANSLATE_FN)(key);
    return actions.find((action) => action.name === name);
  }

  describe('the dice of a roll', () => {
    function lineFrom(from: string, tag: string): void {
      const message = new ChatMessage();
      message.initialize();
      message.from = from;
      message.to = '';
      message.name = 'テスト';
      message.tag = tag;
      message.imageIdentifier = '';
      message.messColor = '#000000';
      message.text = '1D20 → 17';
      fixture.componentRef.setInput('chatMessage', message);
      fixture.detectChanges();
    }

    it('have a stage under the dice bot’s answer, for the dice thrown for it', () => {
      lineFrom('System-BCDice', 'system');

      expect(fixture.nativeElement.querySelector('dice-roll-stage')).toBeTruthy();
    });

    it('have no stage under an ordinary line', () => {
      lineFrom('test-user', '');

      expect(fixture.nativeElement.querySelector('dice-roll-stage')).toBeNull();
    });
  });

  it('shows a picture attached to a line inside it', () => {
    const image = ImageStorage.instance.add('stamp-image.png');
    try {
      const message = new ChatMessage();
      message.initialize();
      message.from = 'test-user';
      message.to = '';
      message.name = 'テスト';
      message.tag = '';
      message.imageIdentifier = '';
      message.messColor = '#000000';
      message.text = '確認';
      message.attachmentImageIdentifiers = JSON.stringify([image.identifier]);
      fixture.componentRef.setInput('chatMessage', message);
      fixture.detectChanges();

      const attachment = fixture.nativeElement.querySelector('.message-attachment-image') as HTMLImageElement | null;
      expect(attachment).toBeTruthy();
      expect(attachment?.getAttribute('src')).toBe('stamp-image.png');
    } finally {
      ImageStorage.instance.delete(image.identifier);
    }
  });

  describe('a line answering a secret roll', () => {
    const made: ChatMessage[] = [];

    function line(fields: Partial<ChatMessage>): ChatMessage {
      const message = new ChatMessage();
      message.initialize();
      message.to = '';
      message.imageIdentifier = '';
      message.messColor = '#000000';
      Object.assign(message, fields);
      made.push(message);
      return message;
    }

    function secretRoll(): ChatMessage {
      return line({
        from: 'someone-else',
        originFrom: 'someone-else',
        name: '<Secret-BCDice：テスト>',
        tag: 'system secret',
        text: 'DiceBot : (1d100) → 3',
      });
    }

    function answering(field: 'replyTo' | 'quoteOf', target: ChatMessage): void {
      const answer = line({
        from: 'someone-else',
        name: 'テスト',
        tag: '',
        text: 'どうだった？',
        [field]: target.identifier,
      });
      fixture.componentRef.setInput('chatMessage', answer);
      fixture.detectChanges();
    }

    afterEach(() => {
      for (const message of made) message.destroy();
      made.length = 0;
    });

    it('shows a reader kept from the roll what stands in for it when replied to', () => {
      vi.spyOn(TestBed.inject(RolePermissionService), 'canSeeHidden', 'get').mockReturnValue(false);
      answering('replyTo', secretRoll());

      expect(component.replyPreview()?.text).toBe(TestBed.inject(TRANSLATE_FN)('feature.chat.message.secretDice'));
      expect(fixture.nativeElement.textContent).not.toContain('→ 3');
    });

    it('shows a reader kept from the roll what stands in for it when quoted', () => {
      vi.spyOn(TestBed.inject(RolePermissionService), 'canSeeHidden', 'get').mockReturnValue(false);
      answering('quoteOf', secretRoll());

      expect(component.quotePreview()?.text).toBe(TestBed.inject(TRANSLATE_FN)('feature.chat.message.secretDice'));
      expect(fixture.nativeElement.textContent).not.toContain('→ 3');
    });

    it('shows the roll to a reader who may see what is hidden', () => {
      vi.spyOn(TestBed.inject(RolePermissionService), 'canSeeHidden', 'get').mockReturnValue(true);
      answering('replyTo', secretRoll());

      expect(component.replyPreview()?.text).toBe('DiceBot : (1d100) → 3');
    });
  });

  it('drops the cover on a secret roll as soon as the tag loses it', () => {
    // The reveal changes only the tag. Nothing else drawn while the line is hidden depends on
    // that message, so without a version to watch the cover would stay on until something
    // else draws.
    vi.spyOn(TestBed.inject(RolePermissionService), 'canSeeHidden', 'get').mockReturnValue(false);

    const message = new ChatMessage();
    message.initialize();
    message.from = 'someone-else';
    // Both, or an unset originFrom matches the unset user id of the peer under test.
    message.originFrom = 'someone-else';
    message.to = '';
    message.name = '<Secret-BCDice：テスト>';
    message.tag = 'system secret';
    message.imageIdentifier = '';
    message.messColor = '#000000';
    message.text = 'DiceBot : (1d6) → 4';
    fixture.componentRef.setInput('chatMessage', message);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('→ 4');

    message.tag = 'system';
    TestBed.inject(ObjectChangeService).notifyChanged(message.identifier);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('→ 4');
  });

  describe('opening a line that was kept back', () => {
    function saySecret(tab: ChatTab, text: string, timestamp: number): ChatMessage {
      return tab.addMessage({ from: 'me', name: text, text, timestamp, tag: 'system-message secret' });
    }

    it('moves the opened line to the end of the tab it was said in', () => {
      const tab = new ChatTab();
      tab.initialize();
      try {
        const secret = saySecret(tab, '隠しダイス → 6', 1000);
        tab.addMessage({ from: 'someone-else', name: 'あと', text: 'そのあとの発言', timestamp: 1001 });
        fixture.componentRef.setInput('chatMessage', secret);

        component.discloseMessage();

        expect(secret.isSecret).toBe(false);
        expect(tab.chatMessages[tab.chatMessages.length - 1]).toBe(secret);
      } finally {
        tab.destroy();
      }
    });

    it('keeps the time the line was said', () => {
      const tab = new ChatTab();
      tab.initialize();
      try {
        const secret = saySecret(tab, '隠しダイス → 6', 1000);
        tab.addMessage({ from: 'someone-else', name: 'あと', text: 'そのあとの発言', timestamp: 1001 });
        fixture.componentRef.setInput('chatMessage', secret);

        component.discloseMessage();

        expect(secret.timestamp).toBe(1000);
      } finally {
        tab.destroy();
      }
    });
  });

  it('takes a portrait that arrives later into the thumbnail', () => {
    const identifier = 'late-arriving-image';
    const message = new ChatMessage();
    message.initialize();
    message.from = 'test-user';
    message.to = '';
    message.name = 'テスト';
    message.tag = '';
    message.imageIdentifier = identifier;
    message.messColor = '#000000';
    message.text = 'まだ画像が届いていない';
    fixture.componentRef.setInput('chatMessage', message);
    fixture.detectChanges();

    expect(component.imageFile().url).toBe('');

    ImageStorage.instance.add({
      identifier,
      name: 'late.png',
      type: '',
      blob: null,
      url: 'late-image.png',
      thumbnail: { type: '', blob: null, url: '' },
    });
    try {
      emitFileLoaded();
      fixture.detectChanges();

      expect(component.imageFile().url).toBe('late-image.png');
      const thumbnail = fixture.nativeElement.querySelector('img') as HTMLImageElement | null;
      expect(thumbnail?.getAttribute('src')).toBe('late-image.png');
    } finally {
      ImageStorage.instance.delete(identifier);
    }
  });

  describe('the bubble behind a line', () => {
    function bubbleColourOf(message: ChatMessage): string | null {
      fixture.componentRef.setInput('chatMessage', message);
      fixture.detectChanges();
      const bubble = fixture.nativeElement.querySelector('[style*="background-color"]') as HTMLElement | null;
      return bubble?.style.backgroundColor ?? null;
    }

    it('is the same for a roll as for the line that asked for it', () => {
      const spoken = new ChatMessage();
      spoken.initialize();
      spoken.from = 'roller-user';
      spoken.name = 'アリス';
      spoken.text = '2d6';
      spoken.messColor = '#006633';

      const rolled = new ChatMessage();
      rolled.initialize();
      rolled.from = 'System-BCDice';
      rolled.originFrom = 'roller-user';
      rolled.tag = 'system';
      rolled.name = '<BCDice：アリス>';
      rolled.text = 'DiceBot : (2D6) → 9';
      rolled.messColor = '#006633';

      const spokenColour = bubbleColourOf(spoken);

      expect(spokenColour).toBeTruthy();
      expect(bubbleColourOf(rolled)).toBe(spokenColour);
    });
  });

  describe('the system avatar', () => {
    function systemMessage(): ChatMessage {
      const message = new ChatMessage();
      message.initialize();
      message.from = 'System';
      message.name = 'システム';
      message.text = 'ようこそ';
      return message;
    }

    function dicebotMessage(): ChatMessage {
      const message = new ChatMessage();
      message.initialize();
      message.from = 'System-BCDice';
      message.tag = 'system';
      message.text = '2D6 → 7';
      return message;
    }

    it('stands in for a system message with the picture the room uses', () => {
      fixture.componentRef.setInput('chatMessage', systemMessage());
      fixture.detectChanges();

      const avatar = fixture.nativeElement.querySelector('img') as HTMLImageElement | null;
      expect(avatar?.getAttribute('src')).toBe(DEFAULT_SYSTEM_AVATAR_URL);
    });

    it('stands in for a roll with the picture kept for rolls', () => {
      fixture.componentRef.setInput('chatMessage', dicebotMessage());
      fixture.detectChanges();

      const avatar = fixture.nativeElement.querySelector('img') as HTMLImageElement | null;
      expect(avatar?.getAttribute('src')).toBe(DEFAULT_SYSTEM_DICE_AVATAR_URL);
    });

    it('stands in for a roll that names a picture this seat does not hold', () => {
      const message = dicebotMessage();
      message.imageIdentifier = '1d6_dice[00]';
      fixture.componentRef.setInput('chatMessage', message);
      fixture.detectChanges();

      const avatar = fixture.nativeElement.querySelector('img') as HTMLImageElement | null;
      expect(avatar?.getAttribute('src')).toBe(DEFAULT_SYSTEM_DICE_AVATAR_URL);
    });

    it('serves the picture the room has chosen instead', () => {
      const image = ImageStorage.instance.add('room-system-chan.png');
      try {
        TestBed.inject(SystemAvatarService).setImage('system', image.identifier);
        fixture.componentRef.setInput('chatMessage', systemMessage());
        fixture.detectChanges();

        const avatar = fixture.nativeElement.querySelector('img') as HTMLImageElement | null;
        expect(avatar?.getAttribute('src')).toBe('room-system-chan.png');
      } finally {
        TestBed.inject(SystemAvatarService).resetImage('system');
        ImageStorage.instance.delete(image.identifier);
      }
    });

    it('puts whoever rolled in the slot once the room asks for the speaker', () => {
      const service = TestBed.inject(SystemAvatarService);
      const image = ImageStorage.instance.add('roller-avatar.png');
      const cursor = new PeerCursor();
      cursor.userId = 'roller-user';
      cursor.imageIdentifier = image.identifier;
      cursor.initialize();
      try {
        service.setSpeakerVisible(true);
        const message = dicebotMessage();
        message.originFrom = 'roller-user';
        fixture.componentRef.setInput('chatMessage', message);
        fixture.detectChanges();

        expect(component.systemAvatarImage()).toEqual({ kind: 'dice', url: 'roller-avatar.png', isSpeaker: true });
      } finally {
        service.setSpeakerVisible(false);
        cursor.destroy();
        ImageStorage.instance.delete(image.identifier);
      }
    });

    it('puts the character rolled as ahead of the player who owns it', () => {
      const service = TestBed.inject(SystemAvatarService);
      const characterImage = ImageStorage.instance.add('character-face.png');
      const playerImage = ImageStorage.instance.add('player-avatar.png');
      const cursor = new PeerCursor();
      cursor.userId = 'roller-user';
      cursor.imageIdentifier = playerImage.identifier;
      cursor.initialize();
      const chatTab = new ChatTab();
      chatTab.initialize();
      try {
        service.setSpeakerVisible(true);
        const spoken = chatTab.addMessage({
          from: 'roller-user',
          name: 'アリス',
          text: '2d6',
          imageIdentifier: characterImage.identifier,
          timestamp: 1000,
        });
        const rolled = chatTab.addMessage({
          from: 'System-BCDice',
          originFrom: 'roller-user',
          name: '<BCDice：アリス>',
          tag: 'system',
          text: '(2D6) → 7',
          timestamp: spoken.timestamp + 1,
        });
        fixture.componentRef.setInput('chatMessage', rolled);
        fixture.detectChanges();

        expect(component.systemAvatarImage()?.url).toBe('character-face.png');
      } finally {
        service.setSpeakerVisible(false);
        chatTab.destroy();
        cursor.destroy();
        ImageStorage.instance.delete(characterImage.identifier);
        ImageStorage.instance.delete(playerImage.identifier);
      }
    });

    it('stops reading through the tab once it has found the line a roll answers', async () => {
      const service = TestBed.inject(SystemAvatarService);
      const characterImage = ImageStorage.instance.add('character-face-2.png');
      const chatTab = new ChatTab();
      chatTab.initialize();
      try {
        service.setSpeakerVisible(true);
        const spoken = chatTab.addMessage({
          from: 'roller-user',
          name: 'アリス',
          text: '2d6',
          imageIdentifier: characterImage.identifier,
          timestamp: 1000,
        });
        const rolled = chatTab.addMessage({
          from: 'System-BCDice',
          originFrom: 'roller-user',
          name: '<BCDice：アリス>',
          tag: 'system',
          text: '(2D6) → 7',
          timestamp: spoken.timestamp + 1,
        });
        fixture.componentRef.setInput('chatMessage', rolled);
        fixture.detectChanges();
        expect(component.systemAvatarImage()?.url).toBe('character-face-2.png');

        chatTab.addMessage({ from: 'another-user', name: 'ボブ', text: 'こんにちは', timestamp: 2000 });
        await Promise.resolve();
        const read = vi.spyOn(chatTab, 'chatMessages', 'get');

        expect(component.systemAvatarImage()?.url).toBe('character-face-2.png');
        expect(read).not.toHaveBeenCalled();
      } finally {
        service.setSpeakerVisible(false);
        chatTab.destroy();
        ImageStorage.instance.delete(characterImage.identifier);
      }
    });

    it('puts whoever asked for a system notice in the slot', () => {
      const service = TestBed.inject(SystemAvatarService);
      const image = ImageStorage.instance.add('gm-avatar.png');
      const cursor = new PeerCursor();
      cursor.userId = 'gm-user';
      cursor.imageIdentifier = image.identifier;
      cursor.initialize();
      try {
        service.setSpeakerVisible(true);
        const message = systemMessage();
        message.from = 'gm-user';
        message.tag = 'system-message';
        fixture.componentRef.setInput('chatMessage', message);
        fixture.detectChanges();

        expect(component.systemAvatarImage()).toEqual({ kind: 'system', url: 'gm-avatar.png', isSpeaker: true });
      } finally {
        service.setSpeakerVisible(false);
        cursor.destroy();
        ImageStorage.instance.delete(image.identifier);
      }
    });

    it('keeps the mascot when whoever rolled has no picture', () => {
      const service = TestBed.inject(SystemAvatarService);
      try {
        service.setSpeakerVisible(true);
        fixture.componentRef.setInput('chatMessage', dicebotMessage());
        fixture.detectChanges();

        expect(component.systemAvatarImage()?.url).toBe(DEFAULT_SYSTEM_DICE_AVATAR_URL);
      } finally {
        service.setSpeakerVisible(false);
      }
    });

    it('leaves the slot empty once the room picks no picture for it', () => {
      const service = TestBed.inject(SystemAvatarService);
      try {
        service.setImage('system', NO_SYSTEM_AVATAR);
        fixture.componentRef.setInput('chatMessage', systemMessage());
        fixture.detectChanges();

        expect(component.systemAvatarImage()).toBeNull();
        expect(fixture.nativeElement.querySelector('img')).toBeNull();
      } finally {
        service.resetImage('system');
      }
    });

    it('leaves the picture out once the room hides it', () => {
      const service = TestBed.inject(SystemAvatarService);
      try {
        service.setVisible(false);
        fixture.componentRef.setInput('chatMessage', systemMessage());
        fixture.detectChanges();

        expect(component.systemAvatarImage()).toBeNull();
        expect(fixture.nativeElement.querySelector('img')).toBeNull();
      } finally {
        service.setVisible(true);
      }
    });
  });

  describe('escapeHtmlAndRuby', () => {
    it('reads the version signal', () => {
      const objectChange = TestBed.inject(ObjectChangeService);
      const spy = vi.spyOn(objectChange, 'versionOf');
      const mockMessage = { identifier: 'test-msg-id' } as ChatMessage;
      fixture.componentRef.setInput('chatMessage', mockMessage);

      component.escapeHtmlAndRuby('テスト');

      expect(spy).toHaveBeenCalledWith('test-msg-id');
    });

    it('does not throw without a message', () => {
      fixture.componentRef.setInput('chatMessage', undefined as unknown as ChatMessage);
      expect(() => component.escapeHtmlAndRuby('テスト')).not.toThrow();
    });

    it('writes the ruby out in full, which lays out in every browser', () => {
      const mockMessage = { identifier: 'ruby-msg-id' } as ChatMessage;
      fixture.componentRef.setInput('chatMessage', mockMessage);

      const result = component.escapeHtmlAndRuby('前｜漢字《かんじ》後');

      expect(result).toBe('前<ruby class="chat-ruby"><rb>漢字</rb><rt>かんじ</rt></ruby>後');
    });

    it('escapes both the text and the ruby over it', () => {
      const mockMessage = { identifier: 'ruby-escape-msg-id' } as ChatMessage;
      fixture.componentRef.setInput('chatMessage', mockMessage);

      const result = component.escapeHtmlAndRuby('｜<本文>《"ルビ"》');

      expect(result).toBe('<ruby class="chat-ruby"><rb>&lt;本文&gt;</rb><rt>&quot;ルビ&quot;</rt></ruby>');
    });

    it('wraps a quoted line in a quotation', () => {
      const mockMessage = { identifier: 'quote-msg-id' } as ChatMessage;
      fixture.componentRef.setInput('chatMessage', mockMessage);

      const result = component.escapeHtmlAndRuby('hello\n> quoted line\nworld');

      expect(result).toBe('hello\n<span class="chat-quote">quoted line</span>\nworld');
    });

    it('gathers consecutive quoted lines into one', () => {
      const mockMessage = { identifier: 'quote-msg-id-2' } as ChatMessage;
      fixture.componentRef.setInput('chatMessage', mockMessage);

      const result = component.escapeHtmlAndRuby('> @プレイヤー\n> aaaaaaaaaa');

      expect(result).toBe('<span class="chat-quote">@プレイヤー<br>aaaaaaaaaa</span>');
    });

    it('leaves an unquoted line alone', () => {
      const mockMessage = { identifier: 'no-quote-msg-id' } as ChatMessage;
      fixture.componentRef.setInput('chatMessage', mockMessage);

      const result = component.escapeHtmlAndRuby('普通のメッセージ\n>not a quote (no space)');

      expect(result).toContain('chat-quote');
      // reads a quote mark without a space after it as a quotation
    });
  });

  describe('clickShareAsMemo', () => {
    function memoIcon(): ContextMenuAction | null {
      return itemOf(menuFrom('more'), 'feature.chat.message.shareAsMemo') ?? null;
    }

    it('turns a line into a note and puts it in the store', () => {
      const message = new ChatMessage();
      message.initialize();
      message.from = 'tester';
      message.name = '勇者';
      message.text = '世界を救うのだ';
      fixture.componentRef.setInput('chatMessage', message);

      fixture.detectChanges();
      expect(memoIcon()).not.toBeNull();

      const beforeNotes = ObjectStore.instance.getObjects(TextNote);
      try {
        component.clickShareAsMemo();
        const afterNotes = ObjectStore.instance.getObjects(TextNote);
        const created = afterNotes.find((n) => !beforeNotes.includes(n));
        expect(created).toBeTruthy();
        expect(created!.title).toBe('勇者');
        expect(created!.text).toBe('世界を救うのだ');
      } finally {
        const created = ObjectStore.instance.getObjects(TextNote).find((n) => !beforeNotes.includes(n));
        created?.destroy();
      }
    });

    it('lays a note shared from chat flat in 2D mode', () => {
      const message = new ChatMessage();
      message.initialize();
      message.from = 'tester';
      message.name = '勇者';
      message.text = '地図に置くメモ';
      fixture.componentRef.setInput('chatMessage', message);
      const tabletop = TestBed.inject(TabletopService);
      tabletop.currentTable.mode2d = true;
      const beforeNotes = ObjectStore.instance.getObjects(TextNote);

      try {
        component.clickShareAsMemo();
        const created = ObjectStore.instance.getObjects(TextNote).find((note) => !beforeNotes.includes(note));
        expect(created?.isUpright).toBe(false);
      } finally {
        tabletop.currentTable.mode2d = false;
        const created = ObjectStore.instance.getObjects(TextNote).find((note) => !beforeNotes.includes(note));
        created?.destroy();
      }
    });

    it('offers nothing to a guest, who is at the table to watch', () => {
      const message = new ChatMessage();
      message.initialize();
      message.from = 'tester';
      message.name = '勇者';
      message.text = '世界を救うのだ';
      fixture.componentRef.setInput('chatMessage', message);
      vi.spyOn(TestBed.inject(RolePermissionService), 'canEditTabletop', 'get').mockReturnValue(false);
      fixture.detectChanges();

      const before = ObjectStore.instance.getObjects(TextNote).length;
      component.clickShareAsMemo();

      expect(component.canShareAsMemo).toBe(false);
      expect(ObjectStore.instance.getObjects(TextNote).length).toBe(before);
      expect(memoIcon()).toBeNull();
    });

    it('does nothing for a line of nothing but spaces', () => {
      const message = new ChatMessage();
      message.initialize();
      message.from = 'tester';
      message.name = 'GM';
      message.text = '   \n  ';
      fixture.componentRef.setInput('chatMessage', message);

      const before = ObjectStore.instance.getObjects(TextNote).length;
      component.clickShareAsMemo();
      const after = ObjectStore.instance.getObjects(TextNote).length;
      expect(after).toBe(before);
    });

    it('falls back to the default title for a nameless note', () => {
      const message = new ChatMessage();
      message.initialize();
      message.from = 'tester';
      message.name = '';
      message.text = 'メモ本文';
      fixture.componentRef.setInput('chatMessage', message);

      const beforeNotes = ObjectStore.instance.getObjects(TextNote);
      try {
        component.clickShareAsMemo();
        const created = ObjectStore.instance.getObjects(TextNote).find((n) => !beforeNotes.includes(n));
        expect(created).toBeTruthy();
        // the default title of a shared note
        expect(created!.title).toBe('共有メモ');
      } finally {
        const created = ObjectStore.instance.getObjects(TextNote).find((n) => !beforeNotes.includes(n));
        created?.destroy();
      }
    });

    it('makes no note out of a system message, which cannot be acted on', () => {
      const message = new ChatMessage();
      message.initialize();
      message.from = 'System';
      message.name = 'システム';
      message.text = 'ようこそ';
      fixture.componentRef.setInput('chatMessage', message);

      expect(component.canInteract).toBe(false);
      const before = ObjectStore.instance.getObjects(TextNote).length;
      component.clickShareAsMemo();
      expect(ObjectStore.instance.getObjects(TextNote).length).toBe(before);
    });

    it('cannot act on anything tagged as a system message', () => {
      const message = new ChatMessage();
      message.initialize();
      message.from = 'tester';
      message.tag = 'system-message';
      message.text = 'sys';
      fixture.componentRef.setInput('chatMessage', message);

      expect(component.canInteract).toBe(false);
    });

    it('can reply to, quote and note a dice bot message', () => {
      const message = new ChatMessage();
      message.initialize();
      message.from = 'System-BCDice';
      message.tag = 'system';
      message.text = '2D6 → 7';
      fixture.componentRef.setInput('chatMessage', message);

      expect(component.canInteract).toBe(true);
      const before = ObjectStore.instance.getObjects(TextNote).length;
      try {
        component.clickShareAsMemo();
        expect(ObjectStore.instance.getObjects(TextNote).length).toBe(before + 1);
      } finally {
        const created = ObjectStore.instance
          .getObjects(TextNote)
          .find((n, idx) => idx >= before && n.text === '2D6 → 7');
        created?.destroy();
      }
    });
  });

  describe('the menu of what can be done with a line', () => {
    let open: MockInstance<ContextMenuService['open']>;
    const clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    const strays: Element[] = [];

    beforeEach(() => {
      open = vi.spyOn(TestBed.inject(ContextMenuService), 'open').mockImplementation(() => undefined);
      vi.spyOn(TestBed.inject(PointerDeviceService), 'isAllowedToOpenContextMenu', 'get').mockReturnValue(true);
      vi.spyOn(TestBed.inject(ViewportService), 'isTouch').mockReturnValue(false);
    });

    afterEach(() => {
      if (clipboard) Object.defineProperty(navigator, 'clipboard', clipboard);
      else Reflect.deleteProperty(navigator, 'clipboard');
      window.getSelection()?.removeAllRanges();
      strays.splice(0).forEach((stray) => stray.remove());
    });

    function wordsIn(element: Element, words: string): Text {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if ((node as Text).data.includes(words)) return node as Text;
      }
      throw new Error(`"${words}" is not drawn`);
    }

    function outsideTheLine(words: string): Text {
      const paragraph = document.createElement('p');
      paragraph.textContent = words;
      (fixture.nativeElement as Element).before(paragraph);
      strays.push(paragraph);
      return paragraph.firstChild as Text;
    }

    function pickOut(start: Text, startOffset: number, end: Text, endOffset: number): void {
      const range = document.createRange();
      range.setStart(start, startOffset);
      range.setEnd(end, endOffset);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
    }

    function said(text: string): ChatMessage {
      const message = new ChatMessage();
      message.initialize();
      message.from = 'someone-else';
      message.to = '';
      message.name = 'テスト';
      message.tag = '';
      message.imageIdentifier = '';
      message.messColor = '#000000';
      message.text = text;
      fixture.componentRef.setInput('chatMessage', message);
      fixture.detectChanges();
      return message;
    }

    function pressOn(target: Element): MouseEvent {
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      target.dispatchEvent(event);
      return event;
    }

    function offered(): ContextMenuAction[] {
      return open.mock.calls[0][1];
    }

    it('opens on a right click or a press held on the line, with what its buttons offer', () => {
      const t = TestBed.inject(TRANSLATE_FN);
      said('こんにちは');

      const event = pressOn(fixture.nativeElement.querySelector('.msg-text'));

      expect(event.defaultPrevented).toBe(true);
      expect(offered().map((action) => action.name)).toEqual(
        expect.arrayContaining([
          t('feature.chat.message.reply'),
          t('feature.chat.message.quote'),
          t('feature.chat.message.copyText'),
        ])
      );
    });

    it("leaves a link the browser's own menu", () => {
      said('https://example.com');
      const link = fixture.nativeElement.querySelector('.msg-text a') as Element | null;

      expect(link).not.toBeNull();
      pressOn(link!);

      expect(open).not.toHaveBeenCalled();
    });

    it('offers nothing in a window that only reads the log', () => {
      fixture.componentRef.setInput('readOnly', true);
      said('こんにちは');

      pressOn(fixture.nativeElement.querySelector('.msg-text'));

      expect(open).not.toHaveBeenCalled();
    });

    it('copies the words of the line as the reader is shown them', () => {
      const t = TestBed.inject(TRANSLATE_FN);
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
      said('こんにちは');

      pressOn(fixture.nativeElement.querySelector('.msg-text'));
      offered()
        .find((action) => action.name === t('feature.chat.message.copyText'))
        ?.action?.();

      expect(writeText).toHaveBeenCalledWith('こんにちは');
    });

    it("leaves the browser's own menu to a right click with words in the line picked out", () => {
      said('こんにちは、みなさん');
      const body = fixture.nativeElement.querySelector('.msg-text') as Element;
      const words = wordsIn(body, 'みなさん');
      pickOut(words, words.data.indexOf('みなさん'), words, words.data.length);

      const event = pressOn(body);

      expect(event.defaultPrevented).toBe(false);
      expect(open).not.toHaveBeenCalled();
    });

    it("leaves the browser's own menu when the words picked out run on into the line", () => {
      said('こんにちは、みなさん');
      const body = fixture.nativeElement.querySelector('.msg-text') as Element;
      const before = outsideTheLine('前の話');
      const words = wordsIn(body, 'こんにちは');
      pickOut(before, 1, words, words.data.indexOf('、'));

      const event = pressOn(body);

      expect(event.defaultPrevented).toBe(false);
      expect(open).not.toHaveBeenCalled();
    });

    it('still opens over a line when the words picked out lie elsewhere on the page', () => {
      said('こんにちは');
      const elsewhere = outsideTheLine('前の話');
      pickOut(elsewhere, 0, elsewhere, 2);

      const event = pressOn(fixture.nativeElement.querySelector('.msg-text'));

      expect(event.defaultPrevented).toBe(true);
      expect(open).toHaveBeenCalledTimes(1);
    });

    it('copies only the words picked out in the line when a press held on a touch screen opens the menu', () => {
      const t = TestBed.inject(TRANSLATE_FN);
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
      vi.spyOn(TestBed.inject(ViewportService), 'isTouch').mockReturnValue(true);
      said('こんにちは、みなさん');
      const body = fixture.nativeElement.querySelector('.msg-text') as Element;
      const words = wordsIn(body, 'みなさん');
      pickOut(words, words.data.indexOf('みなさん'), words, words.data.length);

      pressOn(body);
      offered()
        .find((action) => action.name === t('feature.chat.message.copyText'))
        ?.action?.();

      expect(writeText).toHaveBeenCalledWith('みなさん');
    });

    describe('copying the words', () => {
      function copied(): MockInstance<(text: string) => Promise<void>> {
        const t = TestBed.inject(TRANSLATE_FN);
        const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
        pressOn(fixture.nativeElement.querySelector('.msg-text'));
        offered()
          .find((action) => action.name === t('feature.chat.message.copyText'))
          ?.action?.();
        return writeText;
      }

      it('copies a notice from the room in the words the reader is shown, not the key it is kept as', () => {
        const t = TestBed.inject(TRANSLATE_FN);
        const message = said(encodeI18nMessage('feature.lobby.errors.generic', { errorType: 'timeout' }));
        message.from = 'System';
        fixture.detectChanges();

        expect(copied()).toHaveBeenCalledWith(t('feature.lobby.errors.generic', { errorType: 'timeout' }));
      });

      it('copies ruby as the words with their reading after them, and an escaped space as a space', () => {
        said('前｜漢字《かんじ》後\\sです');

        expect(copied()).toHaveBeenCalledWith('前漢字（かんじ）後 です');
      });
    });

    describe('over a picture on the line', () => {
      const images: string[] = [];

      afterEach(() => {
        images.splice(0).forEach((identifier) => ImageStorage.instance.delete(identifier));
      });

      function saidWithPictures(): void {
        const portrait = ImageStorage.instance.add('speaker-portrait.png');
        const attached = ImageStorage.instance.add('attached-picture.png');
        images.push(portrait.identifier, attached.identifier);
        const message = said('見て');
        message.imageIdentifier = portrait.identifier;
        message.attachmentImageIdentifiers = JSON.stringify([attached.identifier]);
        TestBed.inject(ObjectChangeService).notifyChanged(message.identifier);
        fixture.detectChanges();
      }

      function attachedPicture(): Element {
        return fixture.nativeElement.querySelector('.message-attachment-image');
      }

      function portrait(): Element {
        return fixture.nativeElement.querySelector('img[src="speaker-portrait.png"]');
      }

      it("leaves the browser's own menu to a right click on a picture attached to the line", () => {
        saidWithPictures();

        const event = pressOn(attachedPicture());

        expect(event.defaultPrevented).toBe(false);
        expect(open).not.toHaveBeenCalled();
      });

      it("leaves the browser's own menu to a press held on an attached picture on a touch screen", () => {
        vi.spyOn(TestBed.inject(ViewportService), 'isTouch').mockReturnValue(true);
        saidWithPictures();

        const event = pressOn(attachedPicture());

        expect(event.defaultPrevented).toBe(false);
        expect(open).not.toHaveBeenCalled();
      });

      it("leaves the browser's own menu to a right click on the speaker's portrait", () => {
        saidWithPictures();

        const event = pressOn(portrait());

        expect(event.defaultPrevented).toBe(false);
        expect(open).not.toHaveBeenCalled();
      });

      it("still opens the line's menu from a press held on the speaker's portrait on a touch screen", () => {
        vi.spyOn(TestBed.inject(ViewportService), 'isTouch').mockReturnValue(true);
        saidWithPictures();

        const event = pressOn(portrait());

        expect(event.defaultPrevented).toBe(true);
        expect(open).toHaveBeenCalledTimes(1);
      });
    });

    describe('picking out the words of a line on a touch screen', () => {
      async function pickingOut(): Promise<Element> {
        const t = TestBed.inject(TRANSLATE_FN);
        vi.spyOn(TestBed.inject(ViewportService), 'isTouch').mockReturnValue(true);
        said('こんにちは、みなさん');
        const body = fixture.nativeElement.querySelector('.msg-text') as Element;
        pressOn(body);
        offered()
          .find((action) => action.name === t('feature.chat.message.selectText'))
          ?.action?.();
        fixture.detectChanges();
        await fixture.whenStable();
        open.mockClear();
        return body;
      }

      function isSelectable(body: Element): boolean {
        fixture.detectChanges();
        return body.classList.contains('select-text!');
      }

      it('is offered from the menu of a line on a touch screen', () => {
        const t = TestBed.inject(TRANSLATE_FN);
        vi.spyOn(TestBed.inject(ViewportService), 'isTouch').mockReturnValue(true);
        said('こんにちは');

        pressOn(fixture.nativeElement.querySelector('.msg-text'));

        expect(offered().map((action) => action.name)).toContain(t('feature.chat.message.selectText'));
      });

      it('lets the words of that line be picked out, and picks them all out', async () => {
        const body = await pickingOut();

        expect(isSelectable(body)).toBe(true);
        expect(window.getSelection()?.toString()).toBe('こんにちは、みなさん');
      });

      it('opens no menu over the words while they are being picked out', async () => {
        const body = await pickingOut();

        const event = pressOn(body);

        expect(event.defaultPrevented).toBe(false);
        expect(open).not.toHaveBeenCalled();
      });

      it('ends once the words are let go, and the menu opens again', async () => {
        const body = await pickingOut();

        window.getSelection()?.removeAllRanges();

        expect(isSelectable(body)).toBe(false);
        pressOn(body);
        expect(open).toHaveBeenCalledTimes(1);
      });

      it('ends once the words picked out move off the line', async () => {
        const body = await pickingOut();
        const elsewhere = outsideTheLine('前の話');

        pickOut(elsewhere, 0, elsewhere, 2);

        expect(isSelectable(body)).toBe(false);
      });

      it('ends on a tap somewhere else, letting the words go', async () => {
        const body = await pickingOut();
        const elsewhere = outsideTheLine('前の話');

        elsewhere.parentElement!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));

        expect(isSelectable(body)).toBe(false);
        expect(window.getSelection()?.toString()).toBe('');
      });

      it('carries on through a tap on the line itself', async () => {
        const body = await pickingOut();

        body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));

        expect(isSelectable(body)).toBe(true);
      });
    });
  });

  describe('the ticker action', () => {
    it('stays off a screen that is not running a ticker', () => {
      const message = new ChatMessage('ticker-action-off');
      message.initialize();
      message.from = 'tester';
      message.name = 'GM';
      message.text = '扉が開いた';
      fixture.componentRef.setInput('chatMessage', message);

      fixture.detectChanges();

      expect(component.canShowInTicker()).toBe(false);
      expect(itemOf(menuFrom('more'), 'feature.chat.message.ticker')).toBeUndefined();
      message.destroy();
    });

    it('is offered among what passes the line on, and broadcasts an ordinary public message', () => {
      const message = new ChatMessage('ticker-action-message');
      message.initialize();
      message.from = 'tester';
      message.name = 'GM';
      message.text = '扉が開いた';
      fixture.componentRef.setInput('chatMessage', message);
      const tickerSelection = TestBed.inject(ChatTickerSelectionService);
      const spy = vi.spyOn(tickerSelection, 'showMessage');
      // The band runs along the edge of a table looked straight down on, and nowhere else.
      TestBed.inject(ViewModePreferenceService).choose('flat');
      TestBed.inject(TabletopDisplayService).set({ multiAngleTickerEnabled: true });

      fixture.detectChanges();
      const menu = menuFrom('more');
      const ticker = itemOf(menu, 'feature.chat.message.ticker');

      expect(component.canShowInTicker()).toBe(true);
      expect(menu.indexOf(ticker!)).toBe(menu.indexOf(itemOf(menu, 'feature.chat.message.shareAsMemo')!) + 1);
      ticker?.action?.();
      expect(spy).toHaveBeenCalledWith(message.identifier);
    });

    it.each([
      { label: 'a direct message', to: 'other-user', tag: '', text: '秘密会話' },
      { label: 'a secret message', to: '', tag: 'secret', text: '秘匿情報' },
      { label: 'a system message', to: '', tag: 'system', text: 'システム通知' },
      { label: 'an empty message', to: '', tag: '', text: '   \n  ' },
    ])('does not offer $label to the public ticker', ({ to, tag, text }) => {
      const message = new ChatMessage();
      message.initialize();
      message.from = 'tester';
      message.to = to;
      message.tag = tag;
      message.text = text;
      fixture.componentRef.setInput('chatMessage', message);

      fixture.detectChanges();

      expect(component.canShowInTicker()).toBe(false);
      expect(itemOf(menuFrom('more'), 'feature.chat.message.ticker')).toBeUndefined();
    });
  });

  describe('saying a line again in another tab', () => {
    const tabs: ChatTab[] = [];

    function makeTab(name: string): ChatTab {
      const tab = new ChatTab();
      tab.name = name;
      tab.initialize();
      const kept = ChatTabList.instance.appendChild(tab)!;
      tabs.push(kept);
      return kept;
    }

    function copyIcon(): ContextMenuAction | null {
      return itemOf(menuFrom('more'), 'feature.chat.message.copyToTab') ?? null;
    }

    function spoken(tab: ChatTab): ChatMessage {
      const message = tab.addMessage({
        from: 'test-user',
        name: 'アリス',
        text: 'こんばんは',
        timestamp: 1000,
        messColor: '#123456',
      });
      fixture.componentRef.setInput('chatMessage', message);
      fixture.detectChanges();
      return message;
    }

    beforeEach(() => {
      PeerCursor.createMyCursor();
    });

    afterEach(() => {
      for (const tab of tabs.splice(0)) tab.destroy();
      (ChatTabList as unknown as { _instance: ChatTabList | undefined })._instance = undefined;
    });

    it('offers the tabs the reader may speak in, and not the one the line is already in', () => {
      const here = makeTab('メイン');
      makeTab('雑談');
      spoken(here);

      expect(component.copyTargets().map((tab) => tab.name)).toEqual(['雑談']);
      expect(copyIcon()).not.toBeNull();
    });

    it('offers nothing where there is nowhere else to say it', () => {
      const here = makeTab('メイン');
      spoken(here);

      expect(component.canCopyToTab).toBe(false);
      expect(copyIcon()).toBeNull();
    });

    it('does not offer to carry a line meant for one person', () => {
      const here = makeTab('メイン');
      makeTab('雑談');
      const whisper = here.addMessage({
        from: 'test-user',
        to: 'someone',
        name: 'アリス',
        text: 'ここだけの話',
        timestamp: 1000,
      });
      fixture.componentRef.setInput('chatMessage', whisper);
      fixture.detectChanges();

      expect(component.canCopyToTab).toBe(false);
      expect(copyIcon()).toBeNull();
    });

    it('says the line again in the chosen tab, as it was said here', () => {
      const here = makeTab('メイン');
      const there = makeTab('雑談');
      const message = spoken(here);

      component.copyToTab(there);

      const copied = there.chatMessages.at(-1)!;
      expect(copied.identifier).not.toBe(message.identifier);
      expect(copied.text).toBe('こんばんは');
      expect(copied.name).toBe('アリス');
      expect(copied.messColor).toBe('#123456');
      expect(copied.timestamp).toBeGreaterThanOrEqual(message.timestamp);
      expect(here.chatMessages).toHaveLength(1);
    });

    it('lists the tabs under one item of the menu, and says the line again in the one chosen', () => {
      const here = makeTab('メイン');
      const there = makeTab('雑談');
      spoken(here);

      const copy = copyIcon()!;
      expect(copy.subActions?.map((tab) => tab.name)).toEqual(['雑談']);
      copy.subActions?.[0].action?.();

      expect(there.chatMessages.at(-1)?.text).toBe('こんばんは');
    });

    it('copies nothing into a tab the reader may not speak in', () => {
      const here = makeTab('メイン');
      const there = makeTab('雑談');
      there.plCanSpeak = false;
      PeerCursor.myCursor.role = PeerRole.Player;
      spoken(here);

      component.copyToTab(there);

      expect(there.chatMessages).toHaveLength(0);
    });
  });

  describe('what can be acted on, and the guards on replying and quoting', () => {
    it('replies to nothing on a system message', () => {
      const message = new ChatMessage();
      message.initialize();
      message.from = 'System';
      fixture.componentRef.setInput('chatMessage', message);
      const ui = TestBed.inject(UiSignalService);
      const spy = vi.spyOn(ui, 'requestChatReply');
      component.clickReply();
      expect(spy).not.toHaveBeenCalled();
    });

    it('quotes nothing on one', () => {
      const message = new ChatMessage();
      message.initialize();
      message.from = 'System';
      message.text = 'msg';
      fixture.componentRef.setInput('chatMessage', message);
      const ui = TestBed.inject(UiSignalService);
      const spy = vi.spyOn(ui, 'requestChatInputText');
      component.clickQuote();
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('the after-the-fact whisper', () => {
    let tab: ChatTab;
    let noa: PeerCursor;

    const host = () => fixture.nativeElement as HTMLElement;

    /** Changes reach the view through the versions a microtask later, as they do in the room. */
    async function settle(): Promise<void> {
      await Promise.resolve();
      fixture.detectChanges();
    }

    function shown(from: string, extra: Partial<ChatMessage> = {}): ChatMessage {
      const message = tab.addMessage({
        from,
        name: 'アリア',
        text: '扉の向こうから声がした',
        timestamp: 1000,
        ...extra,
      });
      fixture.componentRef.setInput('chatMessage', message);
      fixture.detectChanges();
      return message;
    }

    beforeEach(() => {
      beMyself('me');
      PeerCursor.createMyCursor();
      noa = new PeerCursor();
      noa.initialize();
      noa.userId = 'noa';
      noa.name = 'ノア';
      tab = ChatTabList.instance.addChatTab('メイン');
    });

    afterEach(() => {
      tab.destroy();
      noa.destroy();
    });

    it('whispers the reader’s own line to the one picked from the menu, as any whisper is shown, and puts it back', async () => {
      const message = shown('me');

      const whisper = itemOf(menuFrom('more'), 'feature.chat.message.afterWhisper')!;
      expect(whisper.subActions?.map((peer) => peer.name)).toEqual(['ノア']);
      whisper.subActions?.[0].action?.();
      await settle();

      expect(message.to).toBe('noa');
      expect(host().querySelector('.msg-name')?.textContent).toBe('アリア > ノア');
      expect(host().textContent).not.toContain('あとから秘話');

      itemOf(menuFrom('more'), 'feature.chat.message.undoAfterWhisper')!.action?.();
      await settle();

      expect(message.isAfterWhisper).toBe(false);
      expect(message.isDirect).toBe(false);
      expect(host().querySelector('.msg-name')?.textContent).toBe('アリア');
    });

    it('says when there is nobody else in the room to whisper to, offering nothing to press', () => {
      noa.destroy();
      shown('me');

      const nobody = itemOf(menuFrom('more'), 'feature.chat.message.afterWhisperNobody');

      expect(nobody?.enabled).toBe(false);
    });

    it('offers no after-the-fact whisper of somebody else’s line', () => {
      shown('noa');

      expect(itemOf(menuFrom('more'), 'feature.chat.message.afterWhisper')).toBeUndefined();
    });

    it('stops showing a line through an answer to it once it is whispered to somebody else', async () => {
      const original = tab.addMessage({ from: 'noa', name: 'ノア', text: '秘密の合言葉', timestamp: 900 });
      shown('third', { replyTo: original.identifier, quoteOf: original.identifier } as Partial<ChatMessage>);
      expect(fixture.nativeElement.textContent).toContain('秘密の合言葉');

      original.makeAfterWhisper('third', 'サード', 2000);
      await settle();

      expect(fixture.nativeElement.textContent).not.toContain('秘密の合言葉');
    });
  });

  describe('following a line back to the one it answers', () => {
    let tab: ChatTab;

    beforeEach(() => {
      beMyself('me');
      tab = ChatTabList.instance.addChatTab('メイン');
    });

    afterEach(() => tab.destroy());

    it('is offered while the original is shown, and not once it is kept from the reader', async () => {
      const original = tab.addMessage({ from: 'someone', name: 'ノア', text: '元の発言', timestamp: 900 });
      const answer = tab.addMessage({
        from: 'third',
        name: 'サード',
        text: '返事',
        timestamp: 1000,
        replyTo: original.identifier,
      });
      fixture.componentRef.setInput('chatMessage', answer);
      fixture.detectChanges();
      expect(itemOf(menuFrom('more'), 'feature.chat.message.jumpToOriginal')).toBeTruthy();

      original.pseudoDelete(2000);
      await Promise.resolve();
      fixture.detectChanges();

      expect(itemOf(menuFrom('more'), 'feature.chat.message.jumpToOriginal')).toBeUndefined();
    });
  });

  describe('deleting a line', () => {
    let tab: ChatTab;

    async function settle(): Promise<void> {
      await Promise.resolve();
      fixture.detectChanges();
    }

    function shown(from: string, extra: Partial<ChatMessage> = {}): ChatMessage {
      const message = tab.addMessage({ from, name: 'アリア', text: '言い間違い', timestamp: 1000, ...extra });
      fixture.componentRef.setInput('chatMessage', message);
      fixture.detectChanges();
      return message;
    }

    beforeEach(() => {
      beMyself('me');
      tab = ChatTabList.instance.addChatTab('メイン');
    });

    afterEach(() => tab.destroy());

    it('deletes the reader’s own line once they say they are sure, asking as for something not put back', async () => {
      const message = shown('me');
      const ask = vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(true);

      itemOf(menuFrom('more'), 'feature.chat.message.deleteLine')!.action?.();
      await vi.waitFor(() => expect(message.isPseudoDeleted).toBe(true));

      expect(ask).toHaveBeenCalledWith(expect.objectContaining({ danger: true }));
    });

    it('leaves the line as it was when the reader thinks better of it', async () => {
      const message = shown('me');
      const ask = vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(false);

      itemOf(menuFrom('more'), 'feature.chat.message.deleteLine')!.action?.();
      await vi.waitFor(() => expect(ask).toHaveBeenCalled());
      await settle();

      expect(message.isPseudoDeleted).toBe(false);
    });

    it('offers no deleting of somebody else’s line', () => {
      shown('someone');

      expect(itemOf(menuFrom('more'), 'feature.chat.message.deleteLine')).toBeUndefined();
    });

    it('offers deleting last in the menu, apart from the rest', () => {
      shown('me');

      const menu = menuFrom('more');

      expect(menu.at(-1)).toBe(itemOf(menu, 'feature.chat.message.deleteLine'));
      expect(menu.at(-2)?.name).toBe('');
    });

    it('stops showing a deleted line through an answer to it', async () => {
      const original = tab.addMessage({ from: 'someone', name: 'ノア', text: '取り消された話', timestamp: 900 });
      shown('third', { replyTo: original.identifier } as Partial<ChatMessage>);
      expect(fixture.nativeElement.textContent).toContain('取り消された話');

      original.pseudoDelete(2000);
      await settle();

      expect(fixture.nativeElement.textContent).not.toContain('取り消された話');
    });
  });

  describe('the room’s mark', () => {
    let tab: ChatTab;

    const testId = (id: string) =>
      (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(`[data-testid="${id}"]`);

    /** Changes reach the view through the versions a microtask later, as they do in the room. */
    async function settle(): Promise<void> {
      await Promise.resolve();
      fixture.detectChanges();
    }

    function shown(from: string): ChatMessage {
      const message = tab.addMessage({ from, name: 'アリア', text: '扉の向こうから声がした', timestamp: 1000 });
      fixture.componentRef.setInput('chatMessage', message);
      fixture.detectChanges();
      return message;
    }

    beforeEach(() => {
      beMyself('me');
      PeerCursor.createMyCursor();
      PeerCursor.myCursor.role = PeerRole.Player;
      tab = ChatTabList.instance.addChatTab('メイン');
    });

    afterEach(() => tab.destroy());

    it('marks a line for the room from its button, and shows the mark with the name it was given', async () => {
      const message = shown('someone');
      expect(testId('chat-message-bookmark-mark')).toBeNull();

      itemOf(menuFrom('bookmark'), 'feature.chat.message.bookmarks.shared.add')!.action?.();
      message.renameBookmark('事件の証言A');
      await settle();

      expect(message.isBookmarked).toBe(true);
      const mark = testId('chat-message-bookmark-mark')!;
      expect(mark.dataset['kind']).toBe('shared');
      expect(mark.title).toContain('事件の証言A');
    });

    it('marks a line for the reader alone, with a mark of its own, leaving the line as it was', async () => {
      const message = shown('someone');

      itemOf(menuFrom('bookmark'), 'feature.chat.message.bookmarks.personal.add')!.action?.();
      await settle();

      expect(message.isBookmarked).toBe(false);
      expect(TestBed.inject(ChatBookmarkService).isBookmarked(message, 'personal')).toBe(true);
      expect(testId('chat-message-bookmark-mark')?.dataset['kind']).toBe('personal');
    });

    it('lets a guest keep a mark of their own but not put the room’s on', async () => {
      const message = shown('someone');
      message.bookmark(1000);
      PeerCursor.myCursor.role = PeerRole.Guest;
      await settle();

      expect(testId('chat-message-bookmark-mark')?.dataset['kind']).toBe('shared');
      const menu = menuFrom('bookmark');
      expect(itemOf(menu, 'feature.chat.message.bookmarks.shared.add')).toBeUndefined();
      expect(itemOf(menu, 'feature.chat.message.bookmarks.shared.remove')).toBeUndefined();
      expect(itemOf(menu, 'feature.chat.message.bookmarks.personal.add')).toBeTruthy();
    });
  });

  describe('the toolbar over the line', () => {
    let tab: ChatTab;

    const actionsShown = () =>
      [
        ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>(
          '[data-testid^="chat-message-action-"]'
        ),
      ].map((button) => button.dataset['testid']!.replace('chat-message-action-', ''));

    function shown(from: string): ChatMessage {
      const message = tab.addMessage({ from, name: 'アリア', text: '扉の向こうから声がした', timestamp: 1000 });
      fixture.componentRef.setInput('chatMessage', message);
      fixture.detectChanges();
      return message;
    }

    beforeEach(() => {
      beMyself('me');
      PeerCursor.createMyCursor();
      PeerCursor.myCursor.role = PeerRole.Player;
      tab = ChatTabList.instance.addChatTab('メイン');
    });

    afterEach(() => tab.destroy());

    it('holds answering, marking, editing and deleting the reader’s own line, then everything else', () => {
      shown('me');

      expect(actionsShown()).toEqual(['reply', 'quote', 'react', 'bookmark', 'edit', 'delete', 'more']);
    });

    it('holds no editing or deleting of somebody else’s line', () => {
      shown('someone');

      expect(actionsShown()).toEqual(['reply', 'quote', 'react', 'bookmark', 'more']);
    });

    it('asks before deleting from its button, and deletes once the reader is sure', async () => {
      const message = shown('me');
      const ask = vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(true);

      (fixture.nativeElement as HTMLElement)
        .querySelector<HTMLElement>('[data-testid="chat-message-action-delete"]')!
        .click();

      await vi.waitFor(() => expect(message.isPseudoDeleted).toBe(true));
      expect(ask).toHaveBeenCalledWith(expect.objectContaining({ danger: true }));
    });

    it('is not there over a line nothing can be done with', () => {
      // A notice meant for the reader alone, with no words: nothing to answer, mark, change or copy.
      const notice = tab.addMessage({
        from: 'me',
        to: 'me',
        name: 'System',
        text: '',
        tag: 'to-pl-system-message',
        timestamp: 1000,
      });
      fixture.componentRef.setInput('chatMessage', notice);
      fixture.detectChanges();

      expect(actionsShown()).toEqual([]);
    });

    it('holds only the menu over a notice whose words may be copied', () => {
      const notice = tab.addMessage({
        from: 'System',
        name: 'System',
        text: 'ラウンド2',
        tag: 'system-message',
        timestamp: 1000,
      });
      PeerCursor.myCursor.role = PeerRole.Guest;
      fixture.componentRef.setInput('chatMessage', notice);
      fixture.detectChanges();

      expect(actionsShown()).toEqual(['bookmark', 'more']);
    });

    it('is not there over a line only to be read, nor over one being edited', () => {
      shown('me');
      fixture.componentRef.setInput('readOnly', true);
      fixture.detectChanges();
      expect(actionsShown()).toEqual([]);

      fixture.componentRef.setInput('readOnly', false);
      component.startEdit();
      fixture.detectChanges();
      expect(actionsShown()).toEqual([]);
    });

    it('opens its menus for a guest too, holding only what a guest may do', () => {
      shown('someone');
      PeerCursor.myCursor.role = PeerRole.Guest;
      TestBed.inject(ViewModePreferenceService).choose('flat');
      TestBed.inject(TabletopDisplayService).set({ multiAngleTickerEnabled: true });
      fixture.detectChanges();
      const open = vi.spyOn(TestBed.inject(ContextMenuService), 'open').mockImplementation(() => undefined);

      (fixture.nativeElement as HTMLElement)
        .querySelector<HTMLElement>('[data-testid="chat-message-action-more"]')!
        .click();

      const [, actions, , options] = open.mock.calls[0];
      expect(options?.forGuests).toBe(true);
      expect(itemOf(actions, 'feature.chat.message.copyText')).toBeTruthy();
      expect(itemOf(actions, 'feature.chat.message.bookmarks.personal.add')).toBeTruthy();
      expect(itemOf(actions, 'feature.chat.message.bookmarks.shared.add')).toBeUndefined();
      expect(itemOf(actions, 'feature.chat.message.shareAsMemo')).toBeUndefined();
      expect(itemOf(actions, 'feature.chat.message.ticker')).toBeUndefined();
    });

    it('stands on the bubble itself in either layout, so it floats over the line it belongs to', () => {
      shown('me');
      const toolbar = () =>
        (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('[data-testid="chat-message-toolbar"]')!;
      expect(toolbar().parentElement!.classList).toContain('relative');

      fixture.componentRef.setInput('chatSimpleDispFlag', true);
      fixture.detectChanges();

      expect(toolbar().parentElement!.classList).toContain('relative');
    });

    it('opens under its last button the same menu as a right click, titled with the speaker', () => {
      shown('me');
      const open = vi.spyOn(TestBed.inject(ContextMenuService), 'open').mockImplementation(() => undefined);
      vi.spyOn(TestBed.inject(PointerDeviceService), 'isAllowedToOpenContextMenu', 'get').mockReturnValue(true);
      vi.spyOn(TestBed.inject(ViewportService), 'isTouch').mockReturnValue(false);

      (fixture.nativeElement as HTMLElement)
        .querySelector<HTMLElement>('[data-testid="chat-message-action-more"]')!
        .click();
      (fixture.nativeElement as HTMLElement)
        .querySelector('.msg-text')!
        .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));

      const [fromButton, fromRightClick] = open.mock.calls;
      expect(fromButton[1].map((action) => action.name)).toEqual(fromRightClick[1].map((action) => action.name));
      expect(fromButton[2]).toBe('アリア');
    });
  });

  describe('the history of an edited line', () => {
    let tab: ChatTab;

    const testId = (id: string) =>
      (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(`[data-testid="${id}"]`);

    async function settle(): Promise<void> {
      await Promise.resolve();
      fixture.detectChanges();
    }

    function shown(from: string, text: string): ChatMessage {
      const message = tab.addMessage({ from, name: 'アリア', text, timestamp: 1000 });
      fixture.componentRef.setInput('chatMessage', message);
      fixture.detectChanges();
      return message;
    }

    beforeEach(() => {
      beMyself('me');
      tab = ChatTabList.instance.addChatTab('メイン');
    });

    afterEach(() => tab.destroy());

    it('keeps what the line said before when the speaker edits it in place', async () => {
      const message = shown('me', 'こんばんわ');

      component.startEdit();
      component.onEditInput('こんばんは');
      component.saveEdit();
      await settle();

      expect(message.versions.map((version) => version.text)).toEqual(['こんばんわ', 'こんばんは']);
    });

    it('opens every wording under the line from its edited mark, for anyone who sees it, and closes again', async () => {
      const message = shown('someone', 'こんばんわ');
      message.edit('こんばんは', '', 2000);
      message.edit('こんばんは！', '', 3000);
      await settle();
      expect(testId('chat-message-history')).toBeNull();

      testId('chat-message-history-toggle')!.click();
      fixture.detectChanges();

      const versions = [
        ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>(
          '[data-testid="chat-message-history-version"]'
        ),
      ];
      expect(versions.map((version) => version.lastElementChild?.textContent)).toEqual([
        'こんばんわ',
        'こんばんは',
        'こんばんは！',
      ]);

      testId('chat-message-history-toggle')!.click();
      fixture.detectChanges();
      expect(testId('chat-message-history')).toBeNull();
    });

    it('keeps every wording of a secret line from a reader kept from its words', async () => {
      vi.spyOn(TestBed.inject(RolePermissionService), 'canSeeHidden', 'get').mockReturnValue(false);
      const message = shown('someone', 'S1d100 黒幕を疑う');
      message.tag = 'secret';
      message.edit('S1d100 犯人を疑う', '', 2000);
      await settle();

      expect(component.versions()).toEqual([]);
      expect(testId('chat-message-history-toggle')).toBeNull();
      expect(fixture.nativeElement.textContent).not.toContain('黒幕');
      expect(fixture.nativeElement.textContent).not.toContain('犯人');
    });

    it('does not call the wording of a line edited before histories were kept what it first said', async () => {
      const t = TestBed.inject(TRANSLATE_FN);
      const message = shown('someone', '二度目の文面');
      message.fixd = true;
      message.edit('三度目の文面', '', 3000);
      await settle();

      testId('chat-message-history-toggle')!.click();
      fixture.detectChanges();

      const history = testId('chat-message-history')!.textContent!;
      expect(history).toContain(t('feature.chat.message.history.beforeKept'));
      expect(history).not.toContain(t('feature.chat.message.history.original'));
    });

    it('only marks a line edited before its history was kept', async () => {
      const message = shown('someone', 'こんばんは');
      message.fixd = true;
      await settle();

      expect(fixture.nativeElement.textContent).toContain(TestBed.inject(TRANSLATE_FN)('feature.chat.message.edited'));
      expect(testId('chat-message-history-toggle')).toBeNull();
    });
  });

  describe('lighting a line up', () => {
    afterEach(() => vi.useRealTimers());

    it('stays lit for the whole moment from the last time it was lit, however often that was', () => {
      vi.useFakeTimers();
      const message = new ChatMessage();
      message.initialize();
      message.text = '光る発言';
      fixture.componentRef.setInput('chatMessage', message);
      fixture.detectChanges();

      component.flash();
      vi.advanceTimersByTime(1500);
      component.flash();
      vi.advanceTimersByTime(1500);
      expect(component.isHighlighted()).toBe(true);

      vi.advanceTimersByTime(400);
      expect(component.isHighlighted()).toBe(false);
      message.destroy();
    });
  });

  describe('consuming a jump to the original message', () => {
    /**
     * A jump is always cleared once it is consumed.
     * Left there, every message component mounted afterwards would read the same request on
     * its first pass and scroll again.
     */
    function setupMessage(identifier: string) {
      const message = new ChatMessage(identifier);
      message.initialize();
      message.from = 'tester';
      message.text = 'hello';
      fixture.componentRef.setInput('chatMessage', message);
      fixture.detectChanges();
      // Scrolling into view need do nothing here, but without a stub happy-dom throws.
      const host = fixture.nativeElement as HTMLElement;
      host.scrollIntoView = vi.fn();
      return host;
    }

    it('clears the request as soon as it consumes one meant for it', async () => {
      setupMessage('jump-target-msg');
      const ui = TestBed.inject(UiSignalService);

      ui.requestChatJump('jump-target-msg');
      fixture.detectChanges();
      // the clearing and the scrolling both happen on a microtask
      await Promise.resolve();

      expect(ui.chatJumpRequest()).toBeNull();
    });

    it('leaves a request meant for another alone, for that one to consume', () => {
      setupMessage('msg-A');
      const ui = TestBed.inject(UiSignalService);

      ui.requestChatJump('msg-B');
      fixture.detectChanges();

      const req = ui.chatJumpRequest();
      expect(req?.messageIdentifier).toBe('msg-B');
    });
  });
  describe('the novel-mode staging', () => {
    const spoken = (text: string, vnEmote = '') => {
      const message = new ChatMessage();
      message.initialize();
      // What `changeable` compares against, so an edit is allowed whatever ran before this.
      message.from = beMyself().userId;
      message.to = '';
      message.name = 'アリス';
      message.tag = '';
      message.imageIdentifier = '';
      message.messColor = '#000000';
      message.text = text;
      if (vnEmote) message.vnEmote = vnEmote;
      return message;
    };

    it('leaves the body alone when the staging is kept beside the line', () => {
      fixture.componentRef.setInput('chatMessage', spoken('なんだって！？', 'shape:shout bubble:shake'));
      expect(component.escapeHtmlAndRuby('なんだって！？')).toContain('なんだって！？');
      expect(component.escapeHtmlAndRuby('なんだって！？')).not.toContain('〔');
    });

    it('takes the staging off a line said before it was kept apart', () => {
      fixture.componentRef.setInput('chatMessage', spoken('なんだって！？ 〔叫び・ゆれ〕'));
      const drawn = component.escapeHtmlAndRuby('なんだって！？ 〔叫び・ゆれ〕');
      expect(drawn).toContain('なんだって！？');
      expect(drawn).not.toContain('叫び');
    });

    it('leaves a bracket it cannot read alone', () => {
      fixture.componentRef.setInput('chatMessage', spoken('メモ 〔重要〕'));
      expect(component.escapeHtmlAndRuby('メモ 〔重要〕')).toContain('重要');
    });

    it('offers the body alone for editing', () => {
      const message = spoken('なんだって！？ 〔叫び〕');
      fixture.componentRef.setInput('chatMessage', message);
      component.startEdit();
      expect(component.editDraft()).toBe('なんだって！？');
    });

    it('moves an older line staging beside it when the body is edited', () => {
      const message = spoken('なんだって！？ 〔叫び・ゆれ〕');
      fixture.componentRef.setInput('chatMessage', message);
      component.startEdit();
      component.editDraft.set('やっぱりなんでもない');
      component.saveEdit();

      expect(message.text).toBe('やっぱりなんでもない');
      expect(message.vnEmote).toBe('shape:shout bubble:shake');
    });

    it('says nothing about the staging unless the reader asked', () => {
      TestBed.inject(ChatPreferencesService).setShowVnEmoteBadge(false);
      fixture.componentRef.setInput('chatMessage', spoken('なんだって！？', 'shape:shout bubble:shake'));
      expect(component.emoteBadges()).toEqual([]);
    });

    it('names the staging once the reader asks for it', () => {
      TestBed.inject(ChatPreferencesService).setShowVnEmoteBadge(true);
      fixture.componentRef.setInput('chatMessage', spoken('なんだって！？', 'shape:shout bubble:shake'));
      expect(component.emoteBadges()).toHaveLength(2);
    });

    it('names the staging of a line said before it was kept apart', () => {
      TestBed.inject(ChatPreferencesService).setShowVnEmoteBadge(true);
      fixture.componentRef.setInput('chatMessage', spoken('またね 〔退場〕'));
      expect(component.emoteBadges()).toHaveLength(1);
    });

    it('says nothing about a line staged no particular way', () => {
      TestBed.inject(ChatPreferencesService).setShowVnEmoteBadge(true);
      fixture.componentRef.setInput('chatMessage', spoken('こんばんは'));
      expect(component.emoteBadges()).toEqual([]);
    });

    it('does not invent a staging for a line that never had one', () => {
      const message = spoken('こんばんは');
      fixture.componentRef.setInput('chatMessage', message);
      component.startEdit();
      component.editDraft.set('こんにちは');
      component.saveEdit();

      expect(message.text).toBe('こんにちは');
      expect(message.vnEmote).toBe('');
    });
  });

  describe('stamps put on the line', () => {
    let tab: ChatTab;
    const host = () => fixture.nativeElement as HTMLElement;

    function chip(stampId: string): HTMLButtonElement | null {
      return host().querySelector(`[data-testid="chat-message-reaction-${stampId}"]`);
    }

    function count(stampId: string): string | undefined {
      return chip(stampId)?.querySelector('[data-reaction-count]')?.textContent?.trim();
    }

    function shown(): ChatMessage {
      const message = tab.addMessage({ from: 'someone', name: 'GM', text: '扉の向こうで音がした', timestamp: 1000 });
      fixture.componentRef.setInput('chatMessage', message);
      fixture.detectChanges();
      return message;
    }

    function answered(message: ChatMessage, userId: string, name: string, stamps: string): void {
      ChatReaction.create(message.identifier, userId, name).stamps = stamps;
    }

    async function settle(): Promise<void> {
      await Promise.resolve();
      fixture.detectChanges();
    }

    beforeEach(() => {
      beMyself('me');
      PeerCursor.createMyCursor();
      PeerCursor.myCursor.userId = 'me';
      PeerCursor.myCursor.name = 'わたし';
      tab = ChatTabList.instance.addChatTab('メイン');
    });

    afterEach(() => {
      for (const reaction of ObjectStore.instance.getObjects<ChatReaction>(ChatReaction)) reaction.destroy();
      tab.destroy();
    });

    it('shows each stamp on the line with how many put it on, and marks the one the reader put on', async () => {
      const message = shown();
      answered(message, 'other', 'あいて', 'sfx:creepy seal:ok');
      answered(message, 'me', 'わたし', 'sfx:creepy');
      await settle();

      expect(count('sfx:creepy')).toBe('2');
      expect(chip('sfx:creepy')!.getAttribute('aria-pressed')).toBe('true');
      expect(chip('seal:ok')!.getAttribute('aria-pressed')).toBe('false');
      expect(chip('sfx:creepy')!.title).toContain('あいて');
    });

    it('puts the reader\u2019s stamp on and takes it off from its chip', async () => {
      const message = shown();
      answered(message, 'other', 'あいて', 'seal:ok');
      await settle();

      chip('seal:ok')!.click();
      await settle();
      expect(count('seal:ok')).toBe('2');

      chip('seal:ok')!.click();
      await settle();
      expect(count('seal:ok')).toBe('1');
    });

    it('opens the stamps under the toolbar button, and puts the one picked on the line', async () => {
      const message = shown();
      const toggle = vi.spyOn(TestBed.inject(StampPickerService), 'toggle').mockImplementation(() => undefined);

      const button = host().querySelector<HTMLButtonElement>('[data-testid="chat-message-action-react"]')!;
      button.click();
      expect(toggle).toHaveBeenCalledWith(button, expect.any(Function));

      toggle.mock.calls[0][1]('motif:skull');
      await settle();
      expect(TestBed.inject(ChatReactionService).talliesOf(message.identifier)).toEqual([
        expect.objectContaining({ stampId: 'motif:skull', mine: true }),
      ]);
      expect(chip('motif:skull')).not.toBeNull();
    });

    it('draws a line sent as a stamp as the stamp, large, in place of its words, and offers no editing', () => {
      const message = tab.addMessage({
        from: 'me',
        name: 'わたし',
        text: '［ゾワッ］',
        timestamp: 1000,
        stamp: 'sfx:creepy',
      });
      fixture.componentRef.setInput('chatMessage', message);
      fixture.detectChanges();

      const drawn = host().querySelector('[data-testid="chat-message-stamp"] [data-stamp]') as HTMLElement;
      expect(drawn.dataset['stampId']).toBe('sfx:creepy');
      expect(drawn.style.height).toBe('96px');
      expect(host().querySelector('[data-chat-search-text]')).toBeNull();
      expect(host().querySelector('[data-testid="chat-message-action-edit"]')).toBeNull();
    });

    it('shows the words of a line sent as a stamp from a newer version', () => {
      const message = tab.addMessage({
        from: 'someone',
        name: 'GM',
        text: '［新しいスタンプ］',
        timestamp: 1000,
        stamp: 'sfx:from-a-newer-version',
      });
      fixture.componentRef.setInput('chatMessage', message);
      fixture.detectChanges();

      expect(host().querySelector('[data-testid="chat-message-stamp"]')).toBeNull();
      expect(host().textContent).toContain('［新しいスタンプ］');
    });

    it('shows no stamps on a line taken out of the chat', async () => {
      const message = shown();
      answered(message, 'other', 'あいて', 'seal:ok');
      await settle();
      expect(chip('seal:ok')).not.toBeNull();

      message.pseudoDelete(2000);
      await settle();
      expect(chip('seal:ok')).toBeNull();
    });
  });
});
