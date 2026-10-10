import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { NO_SYSTEM_AVATAR, SystemAvatarService } from '@axe/application/chat/system-avatar.service';
import { LanguageService } from '@axe/application/i18n/language.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { DataElement } from '@axe/domain/data/data-element';
import { DiceBot } from '@axe/domain/dice/dice-bot';
import { AudioTag } from '@axe/domain/media/audio-tag';
import { Jukebox } from '@axe/domain/media/jukebox';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { leftOfSlot, VN_STAGE_SLOT_COUNT } from '@axe/domain/visual-novel/vn-stage-cast';
import { ChatPaletteRegistryService } from '@axe/features/chat/chat-palette/chat-palette-registry.service';
import { VisualNovelModeService } from '@axe/features/visual-novel/visual-novel-mode.service';
import { VisualNovelOverlayComponent } from '@axe/features/visual-novel/visual-novel-overlay/visual-novel-overlay.component';
import { VN_BACKLOG_PANEL } from '@axe/features/visual-novel/visual-novel-panels';
import { VisualNovelPlaybackService } from '@axe/features/visual-novel/visual-novel-playback.service';
import { VisualNovelSceneService } from '@axe/features/visual-novel/visual-novel-scene.service';
import { VisualNovelSettingsService } from '@axe/features/visual-novel/visual-novel-settings.service';
import { VisualNovelSoundBoardComponent } from '@axe/features/visual-novel/visual-novel-sound-board/visual-novel-sound-board.component';
import { installPanelLayer } from '@axe/testing/panel-layer';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import GameSystemClass from 'bcdice/lib/game_system';

describe('VisualNovelOverlayComponent', () => {
  let component: VisualNovelOverlayComponent;
  let fixture: ComponentFixture<VisualNovelOverlayComponent>;
  let tab: ChatTab;
  let nextTimestamp = 1000;
  let nextImageId = 0;
  let nextCharacterId = 0;
  const charactersByName = new Map<string, GameCharacter>();

  function characterFor(name: string): GameCharacter {
    let character = charactersByName.get(name);
    if (!character) {
      character = new GameCharacter(`vn-char-${nextCharacterId++}`);
      character.initialize();
      charactersByName.set(name, character);
    }
    return character;
  }

  // A line with a portrait counts as spoken by a character, tying the sender to the picture.
  function addMessage(text: string, name = 'アリス', imageIdentifier = '', imagePos?: number): void {
    const context: Record<string, unknown> = {
      from: 'test-user',
      name,
      text,
      timestamp: nextTimestamp++,
      imageIdentifier,
    };
    if (imageIdentifier.length > 0) context['sendFrom'] = characterFor(name).identifier;
    if (imagePos != null) context['imagePos'] = imagePos;
    tab.addMessage(context);
  }

  function addImage(): string {
    return ImageStorage.instance.add(`test://vn/image-${nextImageId++}.png`).identifier;
  }

  function ensureJukebox(): Jukebox {
    let jukebox = ObjectStore.instance.get<Jukebox>('Jukebox');
    if (!jukebox) {
      jukebox = new Jukebox('Jukebox');
      jukebox.initialize();
    }
    return jukebox;
  }

  let removePanelLayer: (() => void) | undefined;

  function createComponent(): void {
    TestBed.inject(VisualNovelPlaybackService).setChatTab(tab.identifier);
    fixture = TestBed.createComponent(VisualNovelOverlayComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(async () => {
    PeerCursor.createMyCursor();
    TestBed.configureTestingModule({
      imports: [VisualNovelOverlayComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
  });

  beforeEach(() => {
    tab = ChatTabList.instance.addChatTab('テストタブ');
    removePanelLayer = installPanelLayer();
  });

  afterEach(() => {
    fixture?.destroy();
    removePanelLayer?.();
    tab?.destroy();
    for (const character of charactersByName.values()) character.destroy();
    charactersByName.clear();
    AudioStorage.instance.audios.forEach((a) => AudioStorage.instance.delete(a.identifier));
    ObjectStore.instance.getObjects(AudioTag).forEach((t) => ObjectStore.instance.delete(t, false));
    localStorage.removeItem('vn-settings');
    PeerCursor.myCursor.role = PeerRole.Player;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should create', () => {
    createComponent();
    expect(component).toBeTruthy();
  });

  it('opens on the first chat tab', () => {
    createComponent();
    expect(component.chatTabIdentifier).toBe(tab.identifier);
    expect(component.chatTab()).toBe(tab);
  });

  it('follows the newest message', () => {
    addMessage('一つ目');
    addMessage('二つ目');
    createComponent();
    expect(component.currentMessage()?.text).toBe('二つ目');
    expect(component.isLatest()).toBe(true);
  });

  it('shows the whole line at once when it is advanced mid-type', () => {
    addMessage('こんにちは、世界！');
    createComponent();
    expect(component.isTyping()).toBe(true);
    component.advance();
    expect(component.isTyping()).toBe(false);
    expect(component.displayedText()).toBe('こんにちは、世界！');
  });

  it('types the characters out one after another', () => {
    vi.useFakeTimers();
    addMessage('あいうえお');
    createComponent();
    expect(component.displayedText()).toBe('');
    vi.advanceTimersByTime(60);
    expect(component.displayedText()).toBe('あい');
    vi.advanceTimersByTime(300);
    expect(component.displayedText()).toBe('あいうえお');
    expect(component.isTyping()).toBe(false);
  });

  it('writes a reading over its word as the line is typed, never the notation', () => {
    vi.useFakeTimers();
    addMessage('あ|漢字《かんじ》い');
    createComponent();
    vi.advanceTimersByTime(60);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('ruby.chat-ruby rb')?.textContent).toBe('漢');
    expect(host.querySelector('ruby.chat-ruby rt')?.textContent).toBe('かんじ');

    vi.advanceTimersByTime(300);
    fixture.detectChanges();
    expect(component.displayedText()).toBe('あ漢字い');
    expect(host.querySelector('ruby.chat-ruby rb')?.textContent).toBe('漢字');
    expect(host.textContent).not.toMatch(/[|｜《》]/);
  });

  it('goes back, forward and to the latest through the history', () => {
    addMessage('m1');
    addMessage('m2');
    addMessage('m3');
    createComponent();
    component.advance();

    component.back();
    fixture.detectChanges();
    expect(component.currentIndex()).toBe(1);
    expect(component.currentMessage()?.text).toBe('m2');
    expect(component.displayedText()).toBe('m2');
    expect(component.isLatest()).toBe(false);

    component.back();
    fixture.detectChanges();
    expect(component.currentIndex()).toBe(0);

    component.back();
    expect(component.currentIndex()).toBe(0);

    component.advance();
    fixture.detectChanges();
    expect(component.currentIndex()).toBe(1);

    component.toLatest();
    fixture.detectChanges();
    expect(component.isLatest()).toBe(true);
    expect(component.currentMessage()?.text).toBe('m3');
  });

  it('shows a new message while it is on the latest', () => {
    addMessage('m1');
    createComponent();
    component.advance();
    addMessage('m2');
    fixture.detectChanges();
    expect(component.currentMessage()?.text).toBe('m2');
  });

  it('stays put while it is reading an older one', () => {
    addMessage('m1');
    addMessage('m2');
    createComponent();
    component.advance();
    component.back();
    fixture.detectChanges();
    addMessage('m3');
    fixture.detectChanges();
    expect(component.currentIndex()).toBe(0);
    expect(component.currentMessage()?.text).toBe('m1');
    expect(component.isLatest()).toBe(false);
  });

  it('sends to the tab that is open', async () => {
    createComponent();
    const chatMessageService = TestBed.inject(ChatMessageService);
    const sendSpy = vi.spyOn(chatMessageService, 'sendMessage').mockReturnValue(null as unknown as ChatMessage);
    const forLine = vi.spyOn(DiceBot, 'gameSystemForLineAsync').mockResolvedValue(null as unknown as GameSystemClass);

    component.text.set('  やあ  ');
    component.send();
    await vi.waitFor(() => expect(sendSpy).toHaveBeenCalled(), { timeout: 5000 });

    expect(forLine).toHaveBeenCalledWith(expect.any(String), 'やあ');
    expect(sendSpy).toHaveBeenCalledWith(
      tab,
      'やあ',
      null,
      PeerCursor.myCursor.identifier,
      undefined,
      0,
      expect.any(String),
      [{ text: 'やあ', object: null }],
      undefined,
      undefined,
      undefined,
      undefined,
      ''
    );
    expect(component.text()).toBe('');
  });

  it('sends nothing for an empty line', async () => {
    createComponent();
    const chatMessageService = TestBed.inject(ChatMessageService);
    const sendSpy = vi.spyOn(chatMessageService, 'sendMessage');
    component.text.set('   ');
    component.send();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('leaves the novel mode on escape', () => {
    createComponent();
    const vnMode = TestBed.inject(VisualNovelModeService);
    vnMode.activate();
    component.onKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(vnMode.active()).toBe(false);
  });

  it('does not advance the text from a key pressed in a field', () => {
    addMessage('こんにちは');
    createComponent();
    const input = document.createElement('input');
    const event = new KeyboardEvent('keydown', { key: ' ' });
    Object.defineProperty(event, 'target', { value: input });
    const before = component.displayedText();
    component.onKeydown(event);
    expect(component.displayedText()).toBe(before);
  });

  it('puts several speakers on stage at once', () => {
    addMessage('こんにちは', 'アリス', addImage());
    addMessage('やあ', 'ボブ', addImage());
    createComponent();
    const stage = component.stageCharacters();
    expect(stage).toHaveLength(2);
    expect(stage.map((chara) => chara.name)).toContain('アリス');
    expect(stage.find((chara) => chara.isActive)?.name).toBe('ボブ');
    expect(stage.every((chara) => chara.url.length > 0)).toBe(true);
  });

  it('keeps a player off it', () => {
    // keeps a player's line off it even with a picture
    tab.addMessage({
      from: 'test-user',
      name: 'プレイヤー',
      text: '2d6',
      timestamp: nextTimestamp++,
      imageIdentifier: addImage(),
      sendFrom: PeerCursor.myCursor.identifier,
    });
    createComponent();
    expect(component.stageCharacters()).toHaveLength(0);
  });

  it('marks whoever was speaking as it goes back through the history', () => {
    addMessage('こんにちは', 'アリス', addImage());
    addMessage('やあ', 'ボブ', addImage());
    createComponent();
    component.advance();
    component.back();
    fixture.detectChanges();
    expect(component.stageCharacters().find((chara) => chara.isActive)?.name).toBe('アリス');
  });

  it('keeps a system message off it', () => {
    tab.addMessage({
      from: 'System',
      name: 'System',
      text: 'お知らせ',
      timestamp: nextTimestamp++,
      imageIdentifier: addImage(),
    });
    createComponent();
    expect(component.stageCharacters()).toHaveLength(0);
  });

  it('puts the balloon over the portrait of whoever is speaking', () => {
    addMessage('こんにちは', 'アリス', addImage(), 4);
    createComponent();
    const anchor = component.bubbleAnchor();
    expect(anchor?.left).toBeCloseTo(leftOfSlot(4), 3);
    expect(anchor?.bottom).toBe('58vh');
  });

  it('shows a line in the window at the foot of the screen when its speaker is not on stage', () => {
    // A balloon with nobody to come from would float in the middle with its tail on nothing.
    addMessage('こんにちは');
    createComponent();
    expect(component.bubbleAnchor()).toBeNull();
    expect(component.speechLayout()).toBe('adv');
  });

  it('leaves the balloon behind once the stage is cleared under it', () => {
    const image = addImage();
    addMessage('やあ', 'アリス', image);
    createComponent();
    expect(component.speechLayout()).toBe('bubble');

    PeerCursor.myCursor.role = PeerRole.GameMaster;
    TestBed.inject(ObjectChangeService).notifyChanged(PeerCursor.myCursor.identifier);
    TestBed.inject(VisualNovelSceneService).resetStage(tab);
    TestBed.inject(ObjectChangeService).notifyChanged(tab.identifier);
    fixture.detectChanges();

    expect(component.stageCharacters()).toEqual([]);
    expect(component.bubbleAnchor()).toBeNull();
  });

  it('keeps the chosen layout where the speaker is on stage', () => {
    addMessage('こんにちは', 'アリス', addImage(), 4);
    createComponent();
    expect(component.speechLayout()).toBe('bubble');
  });

  it('gives a dice bot message to the mascot and no balloon of its own', () => {
    tab.addMessage({
      from: 'System-BCDice',
      name: 'BCDice',
      tag: 'system',
      text: 'DiceBot : (2D6) → 7[3,4]',
      timestamp: nextTimestamp++,
    });
    createComponent();
    expect(component.systemSpeaker()?.imageUrl).toBe('assets/images/system_chang_roll.webp');
    expect(component.bubbleAnchor()).toBeNull();
  });

  it('leaves the mascot out once the room picks no picture for the rolls', () => {
    const systemAvatar = TestBed.inject(SystemAvatarService);
    try {
      systemAvatar.setImage('dice', NO_SYSTEM_AVATAR);
      tab.addMessage({
        from: 'System-BCDice',
        name: 'BCDice',
        tag: 'system',
        text: 'DiceBot : (2D6) → 7[3,4]',
        timestamp: nextTimestamp++,
      });
      createComponent();

      expect(component.systemSpeaker()?.imageUrl).toBe('');
    } finally {
      systemAvatar.resetImage('dice');
    }
  });

  it('leaves the mascot out of a dice bot message once the room hides it', () => {
    const systemAvatar = TestBed.inject(SystemAvatarService);
    try {
      systemAvatar.setVisible(false);
      tab.addMessage({
        from: 'System-BCDice',
        name: 'BCDice',
        tag: 'system',
        text: 'DiceBot : (2D6) → 7[3,4]',
        timestamp: nextTimestamp++,
      });
      createComponent();

      expect(component.systemSpeaker()?.imageUrl).toBe('');
    } finally {
      systemAvatar.setVisible(true);
    }
  });

  it('never breaks an emoji as it types', () => {
    vi.useFakeTimers();
    TestBed.inject(VisualNovelSettingsService).setTypewriterSpeed('normal');
    addMessage('あ🎉い👨‍👩‍👧う');
    createComponent();

    const seen: string[] = [];
    for (let i = 0; i < 12; i++) {
      seen.push(component.displayedText());
      vi.advanceTimersByTime(30);
      fixture.detectChanges();
    }

    for (const text of seen) {
      expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(text)).toBe(false);
      expect(text).toBe('あ🎉い👨‍👩‍👧う'.slice(0, text.length));
    }
    expect(component.displayedText()).toBe('あ🎉い👨‍👩‍👧う');
    expect(component.isTyping()).toBe(false);
  });

  it('drops the portrait and balloon animations in the quieter mode', () => {
    addMessage('うわあ 〔叫び・ゆれ・ジャンプ〕', 'アリス', addImage());
    createComponent();
    expect(component.bubbleAnimationClass()).toBe('animate-vn-shake');
    expect(component.portraitEmoteClass()).toBe('animate-vn-jump');

    TestBed.inject(VisualNovelSettingsService).setReduceMotion(true);
    fixture.detectChanges();

    expect(component.bubbleAnimationClass()).toBe('');
    expect(component.portraitEmoteClass()).toBe('');
    expect(component.bubbleEnterClass()).toBe('');
    expect(component.portraitAnimationClass()).toBe('');
    expect(component.speakClass()).toBe('');
  });

  it('shows the whole line at once with the typing turned off', () => {
    TestBed.inject(VisualNovelSettingsService).setTypewriterSpeed('off');
    addMessage('こんにちは');
    createComponent();
    expect(component.isTyping()).toBe(false);
    expect(component.displayedText()).toBe('こんにちは');
  });

  it('jumps to any message from the backlog and leaves the log standing', () => {
    addMessage('m1');
    addMessage('m2');
    addMessage('m3');
    createComponent();
    component.toggleBacklog();
    component.jumpTo(0);
    fixture.detectChanges();
    expect(component.currentIndex()).toBe(0);
    expect(component.displayedText()).toBe('m1');
    // Reading somewhere else is what the log is for, so it stays open to be read on.
    expect(component.isBacklogOpen()).toBe(true);
  });

  it('leaves the log standing when a cut-in is played from the sound board', () => {
    addMessage('m1');
    createComponent();
    component.toggleBacklog();
    component.toggleSoundBoard();
    fixture.detectChanges();

    const board = fixture.debugElement.query(By.directive(VisualNovelSoundBoardComponent));
    expect(board).toBeTruthy();
    board.componentInstance.played.emit();
    fixture.detectChanges();

    expect(component.isPopover('soundBoard')).toBe(false);
    expect(component.isBacklogOpen()).toBe(true);
  });

  it('opens and closes the log from the same button', () => {
    addMessage('m1');
    createComponent();
    expect(component.isBacklogOpen()).toBe(false);

    component.toggleBacklog();
    expect(component.isBacklogOpen()).toBe(true);

    component.toggleBacklog();
    expect(component.isBacklogOpen()).toBe(false);
  });

  it('puts the log button out when the log is closed by its own frame', () => {
    addMessage('m1');
    createComponent();
    component.toggleBacklog();
    expect(component.isBacklogOpen()).toBe(true);

    // Closed the way a reader closes it, which the button never hears about of its own accord.
    TestBed.inject(PanelService).closeSingle(VN_BACKLOG_PANEL);

    expect(component.isBacklogOpen()).toBe(false);
  });

  it('opens the log again after it was closed by its own frame', () => {
    addMessage('m1');
    createComponent();
    component.toggleBacklog();
    TestBed.inject(PanelService).closeSingle(VN_BACKLOG_PANEL);

    component.toggleBacklog();

    expect(component.isBacklogOpen()).toBe(true);
  });

  it('takes the log down when novel mode is left', () => {
    addMessage('m1');
    createComponent();
    component.toggleBacklog();

    fixture.destroy();

    expect(TestBed.inject(PanelService).hasSingle(VN_BACKLOG_PANEL)).toBe(false);
  });

  it('goes back through the history on the wheel', () => {
    addMessage('m1');
    addMessage('m2');
    createComponent();
    component.advance();
    component.onMessageWheel(new WheelEvent('wheel', { deltaY: -100, cancelable: true }));
    fixture.detectChanges();
    expect(component.currentIndex()).toBe(0);
  });

  it('sends the chosen expression beside the line and keeps it chosen', async () => {
    createComponent();
    const chatMessageService = TestBed.inject(ChatMessageService);
    const sendSpy = vi.spyOn(chatMessageService, 'sendMessage').mockReturnValue(null as unknown as ChatMessage);
    vi.spyOn(DiceBot, 'gameSystemForLineAsync').mockResolvedValue(null as unknown as GameSystemClass);

    component.selectedShape.set('shout');
    component.selectedBubbleAnimation.set('shake');
    component.selectedPortraitEmote.set('jump');
    component.text.set('なんだって！？');
    component.send();
    await vi.waitFor(() => expect(sendSpy).toHaveBeenCalled(), { timeout: 5000 });

    expect(sendSpy.mock.calls[0][1]).toBe('なんだって！？');
    expect(sendSpy.mock.calls[0][12]).toBe('shape:shout bubble:shake portrait:jump');
    expect(component.selectedShape()).toBe('shout');
    expect(component.selectedBubbleAnimation()).toBe('shake');
    expect(component.selectedPortraitEmote()).toBe('jump');
    component.resetEmote();
    expect(component.selectedShape()).toBe('normal');
    expect(component.hasEmoteSelection()).toBe(false);
  });

  it('shows narration as narration rather than in a balloon', async () => {
    createComponent();
    const chatMessageService = TestBed.inject(ChatMessageService);
    const sendSpy = vi.spyOn(chatMessageService, 'sendMessage').mockReturnValue(null as unknown as ChatMessage);
    vi.spyOn(DiceBot, 'gameSystemForLineAsync').mockResolvedValue(null as unknown as GameSystemClass);
    component.selectedKind.set('narration');
    component.text.set('一行は森の奥へ進んだ。');
    component.send();
    await vi.waitFor(() => expect(sendSpy).toHaveBeenCalled(), { timeout: 5000 });
    expect(sendSpy.mock.calls[0][1]).toBe('一行は森の奥へ進んだ。');
    expect(sendSpy.mock.calls[0][12]).toBe('kind:narration');

    // A line said before the staging was kept apart still reads the same way.
    addMessage('一行は森の奥へ進んだ。 〔地の文〕');
    fixture.detectChanges();
    expect(component.narrationKind()).toBe('narration');
    expect(component.bubbleAnchor()).toBeNull();
  });

  it('shows a location at once, without typing it', () => {
    addMessage('忘れられた森 〔ロケーション〕');
    createComponent();
    expect(component.narrationKind()).toBe('location');
    expect(component.isTyping()).toBe(false);
    expect(component.currentFullText()).toBe('忘れられた森');
  });

  it('sizes the text in the balloon from the setting', () => {
    createComponent();
    const settings = TestBed.inject(VisualNovelSettingsService);
    expect(component.bubbleTextSizeClass()).toBe('text-[15px]/relaxed');
    settings.setTextSize('large');
    expect(component.bubbleTextSizeClass()).toBe('text-[19px]/relaxed');
    settings.setTextSize('small');
    expect(component.bubbleTextSizeClass()).toBe('text-[13px]/relaxed');
  });

  it('keeps the place of the speaking character in range', () => {
    addMessage('こんにちは', 'アリス', addImage());
    const speaker = charactersByName.get('アリス')!;
    createComponent();

    component.toggleSlotGuide();
    expect(component.isPopover('slotGuide')).toBe(true);

    component.pickSlot(99);

    expect(component.isPopover('slotGuide')).toBe(false);
    // Anything outside is pulled to the end frame.
    expect(speaker.vnPortraitPos).toBe(VN_STAGE_SLOT_COUNT - 1);
  });

  it('reads what the room says of itself in words, not as the key it is kept under', () => {
    tab.addMessage({
      from: 'System',
      name: '@i18n:common.chat.systemName:{}',
      text: '@i18n:common.chat.logClearedBy:{"user":"GM"}',
      tag: 'system-message',
      timestamp: nextTimestamp++,
    });
    createComponent();

    expect(component.currentFullText()).toContain('ログをクリア');
    expect(component.currentFullText()).toContain('GM');
    expect(component.speakerName()).not.toContain('@i18n:');
  });

  it('reads a line again when the language is changed', async () => {
    tab.addMessage({
      from: 'System',
      name: '@i18n:common.chat.systemName:{}',
      text: '@i18n:common.chat.logClearedBy:{"user":"GM"}',
      tag: 'system-message',
      timestamp: nextTimestamp++,
    });
    createComponent();
    const spokenAs = component.speakerName();
    const said = component.currentFullText();
    expect(spokenAs).toBeTruthy();
    expect(said).toContain('ログをクリア');

    await TestBed.inject(LanguageService).setLang('en');
    fixture.detectChanges();

    expect(component.speakerName()).not.toBe(spokenAs);
    expect(component.currentFullText()).not.toBe(said);
  });

  describe('choosing which picture speaks', () => {
    /** The character comes with one picture already; the named ones are added after it. */
    function speakerWithPortraits(...names: string[]): GameCharacter {
      addMessage('こんにちは', 'アリス', addImage());
      const speaker = charactersByName.get('アリス')!;
      speaker.createDataElements();
      for (const [index, name] of names.entries()) {
        const element = DataElement.create(`portrait-${index}`, addImage(), { type: 'image' });
        element.currentValue = name;
        speaker.imageDataElement!.appendChild(element);
      }
      return speaker;
    }

    function speakAs(speaker: GameCharacter): void {
      createComponent();
      component.sendFrom = speaker.identifier;
      fixture.detectChanges();
    }

    it('answers the arrow with the next picture', () => {
      const speaker = speakerWithPortraits('笑顔', '怒り');
      speakAs(speaker);

      component.stepSpeakerPortrait(1);

      expect(speaker.selectedPortraitIndex).toBe(1);
      expect(component.speakerPortrait()?.index).toBe(1);
    });

    it('stops at either end of the row', () => {
      const speaker = speakerWithPortraits('笑顔');
      speakAs(speaker);
      const last = speaker.imageDataElement!.children.length - 1;

      component.stepSpeakerPortrait(-1);
      expect(component.speakerPortrait()?.index).toBe(0);

      for (let step = 0; step <= last + 1; step += 1) component.stepSpeakerPortrait(1);
      expect(component.speakerPortrait()?.index).toBe(last);
    });

    it('shows the name of a lone picture too, there being no place to read', () => {
      const speaker = speakerWithPortraits();
      const only = speaker.imageDataElement!.children[0] as DataElement;
      only.currentValue = 'いつもの';
      speakAs(speaker);

      expect(component.speakerPortrait()?.count).toBe(1);
      expect(component.speakerPortraitLabel()).toBe('いつもの');
    });

    it('calls a picture by its name where it has one', () => {
      const speaker = speakerWithPortraits('笑顔');
      speakAs(speaker);

      // The picture the character came with was never named, so it answers to its place.
      expect(component.speakerPortraitLabel()).toBe(`1/${speaker.imageDataElement!.children.length}`);

      component.stepSpeakerPortrait(1);
      expect(component.speakerPortraitLabel()).toBe('笑顔');
    });
  });

  it('places from novel mode without disturbing where the character stands in chat', () => {
    addMessage('こんにちは', 'アリス', addImage());
    const speaker = charactersByName.get('アリス')!;
    speaker.createDataElements();
    speaker.portraitPosition = 2;
    createComponent();

    component.pickSlot(9);

    expect(speaker.vnPortraitPos).toBe(9);
    expect(speaker.portraitPosition).toBe(2);
  });

  it('follows the chat position again once the novel-mode place is given up', async () => {
    addMessage('こんにちは', 'アリス', addImage());
    const speaker = charactersByName.get('アリス')!;
    speaker.createDataElements();
    speaker.portraitPosition = 2;
    createComponent();
    component.pickSlot(9);
    // Change notices are batched into a microtask, so the stage hears about them a tick later.
    await Promise.resolve();
    expect(component.speakerSlot()).toBe(9);

    component.followChatSlot();
    await Promise.resolve();

    expect(component.speakerSlot()).toBe(2);
    expect(component.speakerSlotOverridden()).toBe(false);
  });

  it('keeps a portrait from being cut off at the edge of the screen', () => {
    addMessage('端のキャラ', 'みぎは', addImage(), 11);
    createComponent();
    const stage = component.stageCharacters();
    expect(stage[0].left).toBeLessThanOrEqual(92);
    expect(stage[0].left).toBeGreaterThanOrEqual(8);
  });

  it('shows the body alone of a line with a suffix and works its classes out', () => {
    addMessage('考えごと… 〔もやもや・ドキドキ・ぶるぶる〕');
    createComponent();
    component.advance();
    expect(component.displayedText()).toBe('考えごと…');
    expect(component.isTyping()).toBe(false);
    expect(component.bubbleBoxClass()).toContain('vn-bubble-thought');
    expect(component.bubbleEnterClass()).toBe('vn-enter-thought');
    expect(component.bubbleAnimationClass()).toBe('animate-vn-pulse');
    expect(component.portraitEmoteClass()).toBe('animate-vn-tremble');
  });

  it('gives a line without one the plain shape and the usual entrance', () => {
    addMessage('こんにちは');
    createComponent();
    expect(component.bubbleBoxClass()).toContain('vn-bubble-normal');
    expect(component.bubbleEnterClass()).toBe('vn-enter-normal');
    expect(component.bubbleAnimationClass()).toBe('');
    expect(component.portraitEmoteClass()).toBe('');
  });

  it('gives a shout the hard entrance and the spikes behind it', () => {
    addMessage('なんだって！？ 〔叫び〕');
    createComponent();
    expect(component.isShoutShape()).toBe(true);
    expect(component.bubbleEnterClass()).toBe('vn-enter-shout');
  });

  it('shares the game type with the chat service', () => {
    createComponent();
    const chatMessageService = TestBed.inject(ChatMessageService);
    component.gameType = 'Cthulhu7th';
    expect(chatMessageService.gameType).toBe('Cthulhu7th');
    expect(component.gameType).toBe('Cthulhu7th');
    chatMessageService.gameType = 'DiceBot';
  });

  it('holds no more than six on stage', () => {
    for (let i = 0; i < 8; i++) {
      addMessage(`発言${i}`, `キャラ${i}`, addImage());
    }
    createComponent();
    expect(component.stageCharacters()).toHaveLength(6);
  });

  it('takes the place from the message', () => {
    addMessage('こんにちは', 'アリス', addImage(), 8);
    addMessage('やあ', 'ボブ', addImage(), 2);
    createComponent();
    const stage = component.stageCharacters();
    expect(stage.map((chara) => chara.name)).toEqual(['ボブ', 'アリス']);
    expect(stage[0].slot).toBe(2);
    expect(stage[1].slot).toBe(8);
    expect(stage[0].left).toBeCloseTo(leftOfSlot(2), 3);
    expect(stage[1].left).toBeCloseTo(leftOfSlot(8), 3);
  });

  it('stands a character where they stand in chat, without a place of its own', () => {
    addMessage('こんにちは', 'アリス', addImage());
    const speaker = charactersByName.get('アリス')!;
    speaker.createDataElements();
    speaker.portraitPosition = 6;
    createComponent();

    expect(component.stageCharacters()[0].slot).toBe(6);
  });

  it('moves the portrait when the chat position is changed on the sheet', async () => {
    addMessage('こんにちは', 'アリス', addImage());
    const speaker = charactersByName.get('アリス')!;
    speaker.createDataElements();
    speaker.portraitPosition = 6;
    createComponent();

    speaker.portraitPosition = 1;
    await Promise.resolve();

    expect(component.stageCharacters()[0].slot).toBe(1);
  });

  it('prefers the place given in novel mode over the one used in chat', () => {
    addMessage('こんにちは', 'アリス', addImage());
    const speaker = charactersByName.get('アリス')!;
    speaker.createDataElements();
    speaker.portraitPosition = 6;
    speaker.vnPortraitPos = 10;
    createComponent();

    expect(component.stageCharacters()[0].slot).toBe(10);
  });

  it('prefers the place given to one line over the one the character carries', () => {
    addMessage('こんにちは', 'アリス', addImage());
    const speaker = charactersByName.get('アリス')!;
    speaker.createDataElements();
    speaker.vnPortraitPos = 10;
    tab.chatMessages[tab.chatMessages.length - 1].vnPortraitPos = 3;
    createComponent();

    expect(component.stageCharacters()[0].slot).toBe(3);
  });

  it('reads the place out of a message saved before places were numbers', () => {
    addMessage('こんにちは', 'アリス', addImage());
    // Attributes come back from XML as strings, and a place written as one still has to count.
    (tab.chatMessages[tab.chatMessages.length - 1] as unknown as Record<string, unknown>)['imagePos'] = '7';
    createComponent();

    expect(component.stageCharacters()[0].slot).toBe(7);
  });

  it('shifts two in the same place apart so they do not overlap', () => {
    addMessage('こんにちは', 'アリス', addImage(), 3);
    addMessage('やあ', 'ボブ', addImage(), 3);
    createComponent();
    const stage = component.stageCharacters();
    expect(stage[0].left).not.toBeCloseTo(stage[1].left, 3);
  });

  it('measures every portrait from the same height, however many there are', () => {
    for (let i = 0; i < 6; i++) {
      addMessage(`発言${i}`, `キャラ${i}`, addImage(), i);
    }
    createComponent();
    const stage = component.stageCharacters();
    expect(stage).toHaveLength(6);
    expect(stage.every((chara) => !('width' in chara))).toBe(true);
  });

  it('works the mark out from the suffix', () => {
    addMessage('なっ…！ 〔💢・ぶるぶる〕');
    createComponent();
    expect(component.emotionMark()?.char).toBe('💢');
    expect(component.portraitEmoteClass()).toBe('animate-vn-tremble');
    expect(component.displayedText().length).toBeLessThanOrEqual('なっ…！'.length);
  });

  it('empties the stage while a location is shown', () => {
    addMessage('こんにちは', 'アリス', addImage());
    addMessage('忘れられた森 〔ロケーション〕');
    createComponent();
    expect(component.narrationKind()).toBe('location');
    expect(component.stageCharacters()).toHaveLength(0);
  });

  it('clears the stage of everybody from before a change of scene', () => {
    addMessage('こんにちは', 'アリス', addImage());
    addMessage('場面は変わって 〔場面転換〕');
    addMessage('やあ', 'ボブ', addImage());
    createComponent();
    expect(component.stageCharacters().map((chara) => chara.name)).toEqual(['ボブ']);
  });

  it('takes both the stage and the balloon away while that message is shown', () => {
    addMessage('こんにちは', 'アリス', addImage());
    addMessage('〜その夜〜 〔場面転換〕');
    createComponent();
    expect(component.narrationKind()).toBe('scene');
    expect(component.stageCharacters()).toHaveLength(0);
    expect(component.bubbleAnchor()).toBeNull();
    expect(component.isTyping()).toBe(false);
  });

  it('offers the scene change to the game master alone', () => {
    createComponent();
    const objectChange = TestBed.inject(ObjectChangeService);
    expect(component.messageKindOptions()).not.toContain('scene');
    PeerCursor.myCursor.role = PeerRole.GameMaster;
    objectChange.notifyChanged(PeerCursor.myCursor.identifier);
    expect(component.messageKindOptions()).toContain('scene');
    PeerCursor.myCursor.role = PeerRole.Player;
    objectChange.notifyChanged(PeerCursor.myCursor.identifier);
  });

  it('plays an attached sound as the line is sent and lets it go', async () => {
    const jukebox = ensureJukebox();
    const playSpy = vi.spyOn(jukebox, 'play').mockImplementation(() => undefined);
    createComponent();
    const chatMessageService = TestBed.inject(ChatMessageService);
    const sendSpy = vi.spyOn(chatMessageService, 'sendMessage').mockReturnValue(null as unknown as ChatMessage);
    vi.spyOn(DiceBot, 'gameSystemForLineAsync').mockResolvedValue(null as unknown as GameSystemClass);

    component.attachSe({ identifier: 'audio-1', name: 'ジャーン' });
    component.text.set('ここで効果音');
    component.send();
    await vi.waitFor(() => expect(sendSpy).toHaveBeenCalled(), { timeout: 5000 });

    expect(playSpy).toHaveBeenCalledWith('audio-1');
    expect(component.attachedSe()).toBeNull();
  });

  it('puts the rollers name and face on the mascot for a dice result', () => {
    const rollerImage = addImage();
    addMessage('5d6', 'アリス', rollerImage);
    const command = tab.chatMessages[tab.chatMessages.length - 1];
    tab.addMessage({
      from: 'System-BCDice',
      originFrom: command.from,
      name: '<BCDice：アリス>',
      tag: 'system',
      text: 'DiceBot : (5D6) → 18',
      timestamp: command.timestamp + 1,
    });
    createComponent();
    const speaker = component.systemSpeaker();
    expect(speaker?.rollerName).toBe('アリス');
    expect(speaker?.rollerImageUrl.length).toBeGreaterThan(0);
  });

  it('shows a dice command as a command, with no balloon and nobody on stage', () => {
    addMessage('5d6', 'アリス', addImage());
    const command = tab.chatMessages[tab.chatMessages.length - 1];
    tab.addMessage({
      from: 'System-BCDice',
      originFrom: command.from,
      name: '<BCDice：アリス>',
      tag: 'system',
      text: 'DiceBot : (5D6) → 18[2,3,4,4,5] → 18',
      timestamp: command.timestamp + 1,
    });
    createComponent();

    component.back();
    fixture.detectChanges();
    expect(component.currentMessage()?.text).toBe('5d6');
    expect(component.currentIsDiceCommand()).toBe(true);
    expect(component.diceCommand()?.name).toBe('アリス');
    expect(component.bubbleAnchor()).toBeNull();
    expect(component.stageCharacters()).toHaveLength(0);
    expect(component.displayedText()).toBe('5d6');
  });

  it('keeps whoever rolled off the stage', () => {
    addMessage('こんにちは', 'アリス', addImage());
    addMessage('5d6', 'ボブ', addImage());
    const command = tab.chatMessages[tab.chatMessages.length - 1];
    tab.addMessage({
      from: 'System-BCDice',
      originFrom: command.from,
      name: '<BCDice：ボブ>',
      tag: 'system',
      text: 'DiceBot : (5D6) → 12',
      timestamp: command.timestamp + 1,
    });
    createComponent();
    expect(component.stageCharacters().map((chara) => chara.name)).toEqual(['アリス']);
  });

  it('plays on from where it is', () => {
    addMessage('m1');
    addMessage('m2');
    addMessage('m3');
    createComponent();
    component.jumpTo(1);
    fixture.detectChanges();

    component.toggleAutoPlay();
    fixture.detectChanges();

    expect(component.autoPlay()).toBe(true);
    expect(component.currentIndex()).toBe(1);
  });

  it('skips to the latest while the modifier is held', () => {
    vi.useFakeTimers();
    addMessage('m1');
    addMessage('m2');
    addMessage('m3');
    createComponent();
    component.jumpTo(0);
    fixture.detectChanges();

    component.onKeydown(new KeyboardEvent('keydown', { key: 'Control' }));
    fixture.detectChanges();
    expect(component.isSkipping()).toBe(true);
    vi.advanceTimersByTime(600);
    fixture.detectChanges();

    expect(component.currentIndex()).toBe(2);
    component.onKeyup(new KeyboardEvent('keyup', { key: 'Control' }));
    expect(component.isSkipping()).toBe(false);
  });

  it('shows the messages of whichever tab is chosen', () => {
    addMessage('メインの発言');
    const otherTab = ChatTabList.instance.addChatTab('サブタブ');
    try {
      otherTab.addMessage({ from: 'test-user', name: 'ボブ', text: 'サブの発言', timestamp: nextTimestamp++ });
      createComponent();
      expect(component.messages().map((message) => message.text)).toEqual(['メインの発言']);
      expect(component.chatTabOptions().length).toBeGreaterThan(1);

      component.chatTabIdentifier = otherTab.identifier;
      fixture.detectChanges();

      expect(component.messages().map((message) => message.text)).toEqual(['サブの発言']);
    } finally {
      otherTab.destroy();
    }
  });

  it('does not start playing while it is on the latest', () => {
    addMessage('m1');
    addMessage('m2');
    createComponent();
    expect(component.isLatest()).toBe(true);

    component.toggleAutoPlay();
    fixture.detectChanges();

    expect(component.autoPlay()).toBe(false);
  });

  it('rewinds to the oldest to play from the start', () => {
    addMessage('m1');
    addMessage('m2');
    addMessage('m3');
    createComponent();
    expect(component.currentIndex()).toBe(2);

    component.playFromStart();
    fixture.detectChanges();

    expect(component.autoPlay()).toBe(true);
    expect(component.currentIndex()).toBe(0);
  });

  it('waits a beat after typing and goes on by itself', () => {
    vi.useFakeTimers();
    addMessage('あい');
    addMessage('うえ');
    addMessage('おか');
    createComponent();
    component.playFromStart();
    fixture.detectChanges();
    expect(component.currentIndex()).toBe(0);

    vi.advanceTimersByTime(100);
    fixture.detectChanges();
    expect(component.isTyping()).toBe(false);
    vi.advanceTimersByTime(1200 + 2 * 35 + 50);
    fixture.detectChanges();
    expect(component.currentIndex()).toBe(1);
    expect(component.autoPlay()).toBe(true);
  });

  it('stops playing once it reaches the latest', () => {
    vi.useFakeTimers();
    addMessage('あい');
    addMessage('うえ');
    createComponent();
    component.playFromStart();
    fixture.detectChanges();

    vi.advanceTimersByTime(100);
    fixture.detectChanges();
    vi.advanceTimersByTime(1400);
    fixture.detectChanges();
    expect(component.currentIndex()).toBe(1);

    vi.advanceTimersByTime(100);
    fixture.detectChanges();
    expect(component.isTyping()).toBe(false);
    fixture.detectChanges();
    expect(component.autoPlay()).toBe(false);
  });

  it('stops on any action of yours', () => {
    addMessage('m1');
    addMessage('m2');
    createComponent();
    component.playFromStart();
    fixture.detectChanges();
    expect(component.autoPlay()).toBe(true);
    component.userAdvance();
    expect(component.autoPlay()).toBe(false);

    component.playFromStart();
    fixture.detectChanges();
    expect(component.autoPlay()).toBe(true);
    component.onKeydown(new KeyboardEvent('keydown', { key: ' ' }));
    expect(component.autoPlay()).toBe(false);
  });

  it('chooses the first character rather than a player to speak', () => {
    addMessage('こんにちは', 'アリス', addImage());
    createComponent();
    fixture.detectChanges();
    const characters = component.gameCharacters();
    expect(characters.length).toBeGreaterThan(0);
    expect(component.sendFrom).toBe(characters[0].identifier);
    expect(component.sendFrom).not.toBe(PeerCursor.myCursor.identifier);
  });

  it('offers no speaker standing unseen on the table, as the chat does', () => {
    addMessage('こんにちは', 'アリス', addImage());
    addMessage('……', '闇の魔物', addImage());
    const lurker = characterFor('闇の魔物');
    lurker.setLocation('table');
    const listed = vi
      .spyOn(TestBed.inject(VisionService), 'mayBeListed')
      .mockImplementation((character) => character !== lurker);
    createComponent();
    fixture.detectChanges();

    expect(component.gameCharacters()).not.toContain(lurker);
    expect(component.gameCharacters()).toContain(characterFor('アリス'));
    listed.mockRestore();
  });

  it('moves to another once the chosen character is gone', () => {
    addMessage('こんにちは', 'アリス', addImage());
    addMessage('やあ', 'ボブ', addImage());
    createComponent();
    fixture.detectChanges();
    const characters = component.gameCharacters();
    component.sendFrom = characters[1].identifier;
    characters[1].destroy();
    fixture.detectChanges();
    expect(component.sendFrom).toBe(characters[0].identifier);
  });

  it('flips the portrait of a line that carries the token', () => {
    addMessage('ふりむく 〔反転〕', 'アリス', addImage());
    createComponent();
    const stage = component.stageCharacters();
    expect(stage[0].isFlipped).toBe(true);
    component.advance();
    expect(component.displayedText()).toBe('ふりむく');
  });

  it('records the flip on a line sent while it is flipped', async () => {
    const character = GameCharacter.create('反転テスト', 1, addImage());
    createComponent();
    component.sendFrom = character.identifier;
    const chatMessageService = TestBed.inject(ChatMessageService);
    const sendSpy = vi.spyOn(chatMessageService, 'sendMessage').mockReturnValue(null as unknown as ChatMessage);
    vi.spyOn(DiceBot, 'gameSystemForLineAsync').mockResolvedValue(null as unknown as GameSystemClass);

    component.toggleSpeakerFlip();
    TestBed.inject(ObjectChangeService).notifyChanged(character.identifier);
    fixture.detectChanges();
    expect(component.speakerFlip()).toBe(true);

    component.text.set('ふりかえる');
    component.send();
    await vi.waitFor(() => expect(sendSpy).toHaveBeenCalled(), { timeout: 5000 });
    expect(sendSpy.mock.calls[0][1]).toBe('ふりかえる');
    expect(sendSpy.mock.calls[0][12]).toBe('flip');
    character.destroy();
  });

  it('reads the palette of the chosen character and puts a clicked row into the box', () => {
    const character = GameCharacter.create('パレットテスト', 1, addImage());
    createComponent();
    component.sendFrom = character.identifier;
    fixture.detectChanges();
    const lines = component.speakerPalette();
    expect(lines.length).toBeGreaterThan(0);
    component.pickPaletteLine(lines[0]);
    expect(component.text()).toBe(lines[0]);
    character.destroy();
  });

  it('evaluates the references on a palette row as it sends', async () => {
    const character = GameCharacter.create('評価テスト', 1, addImage());
    createComponent();
    component.sendFrom = character.identifier;
    const palette = character.chatPalette;
    expect(palette).not.toBeNull();
    const evaluateSpy = vi.spyOn(palette!, 'evaluate').mockReturnValue('評価済みテキスト');
    const chatMessageService = TestBed.inject(ChatMessageService);
    const sendSpy = vi.spyOn(chatMessageService, 'sendMessage').mockReturnValue(null as unknown as ChatMessage);
    vi.spyOn(DiceBot, 'gameSystemForLineAsync').mockResolvedValue(null as unknown as GameSystemClass);

    component.text.set('{HP}ダメージ！');
    component.send();
    await vi.waitFor(() => expect(sendSpy).toHaveBeenCalled(), { timeout: 5000 });
    expect(evaluateSpy).toHaveBeenCalled();
    expect(sendSpy.mock.calls[0][1]).toBe('評価済みテキスト');
    character.destroy();
  });

  it('follows the character chosen in the non-player tool', () => {
    const npc = GameCharacter.create('NPCテスト', 1, addImage());
    createComponent();
    const registry = TestBed.inject(ChatPaletteRegistryService);
    expect(registry.active()).not.toBeNull();
    registry.active()!.setCharacterById(npc.identifier);
    expect(component.sendFrom).toBe(npc.identifier);
    npc.destroy();
  });

  it('waits less at a higher speed', () => {
    vi.useFakeTimers();
    TestBed.inject(VisualNovelSettingsService).setAutoPlaySpeed(2);
    addMessage('あい');
    addMessage('うえ');
    addMessage('おか');
    createComponent();
    component.playFromStart();
    fixture.detectChanges();
    vi.advanceTimersByTime(100);
    fixture.detectChanges();
    expect(component.isTyping()).toBe(false);
    vi.advanceTimersByTime(700);
    fixture.detectChanges();
    expect(component.currentIndex()).toBe(1);
  });

  it('closes the backlog alone while it is open', () => {
    createComponent();
    const vnMode = TestBed.inject(VisualNovelModeService);
    vnMode.activate();
    component.toggleBacklog();
    component.onKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(component.isBacklogOpen()).toBe(false);
    expect(vnMode.active()).toBe(true);
  });
  describe('clearing the portraits', () => {
    it('empties the stage and keeps the notice out of the script', () => {
      const image = addImage();
      addMessage('やあ', 'モンスターA', image);
      createComponent();
      fixture.detectChanges();
      expect(component.stageCharacters()).toHaveLength(1);
      const linesBefore = component.messages().length;

      PeerCursor.myCursor.role = PeerRole.GameMaster;
      TestBed.inject(ObjectChangeService).notifyChanged(PeerCursor.myCursor.identifier);
      TestBed.inject(VisualNovelSceneService).resetStage(tab);
      TestBed.inject(ObjectChangeService).notifyChanged(tab.identifier);
      fixture.detectChanges();

      // Nothing has been said since, so the reader is still on the last line; the stage is
      // cleared all the same, and there is no extra line to press through.
      expect(component.stageCharacters()).toEqual([]);
      expect(component.messages()).toHaveLength(linesBefore);
      expect(tab.chatMessages.at(-1)?.isOutOfStory).toBe(true);
    });

    it('keeps the stage clearing behind a line that was opened afterwards', () => {
      const image = addImage();
      addMessage('やあ', 'モンスターA', image);
      const secret = tab.addMessage({
        from: 'test-user',
        name: 'ダイス',
        text: '隠しダイス → 6',
        timestamp: nextTimestamp++,
        tag: 'system-message secret',
      });
      createComponent();

      PeerCursor.myCursor.role = PeerRole.GameMaster;
      TestBed.inject(ObjectChangeService).notifyChanged(PeerCursor.myCursor.identifier);
      TestBed.inject(VisualNovelSceneService).resetStage(tab);
      const notice = tab.chatMessages[tab.chatMessages.length - 1];
      tab.addMessage({
        from: 'test-user',
        name: 'モンスターA',
        text: 'もどってきた',
        timestamp: notice.timestamp + 1,
        imageIdentifier: image,
        sendFrom: characterFor('モンスターA').identifier,
      });
      // and the roll from before the clearing is opened, which brings it to the end of the tab
      TestBed.inject(ChatMessageService).discloseMessage(secret);
      TestBed.inject(ObjectChangeService).notifyChanged(tab.identifier);
      fixture.detectChanges();

      // The clearing lies before what was said since, so that line still stands on the stage.
      expect(component.stageCharacters()).toHaveLength(1);
    });

    it('shows the stage as it stood when read back to before the clearing', () => {
      const image = addImage();
      addMessage('やあ', 'モンスターA', image);
      addMessage('こんばんは', 'モンスターA', image);
      createComponent();

      PeerCursor.myCursor.role = PeerRole.GameMaster;
      TestBed.inject(ObjectChangeService).notifyChanged(PeerCursor.myCursor.identifier);
      TestBed.inject(VisualNovelSceneService).resetStage(tab);
      TestBed.inject(ObjectChangeService).notifyChanged(tab.identifier);
      component.jumpTo(0);
      fixture.detectChanges();

      expect(component.stageCharacters()).toHaveLength(1);
    });
  });
  describe('what the game master says as themselves', () => {
    function gameMasterSpeaks(text: string): void {
      PeerCursor.myCursor.role = PeerRole.GameMaster;
      TestBed.inject(ObjectChangeService).notifyChanged(PeerCursor.myCursor.identifier);
      tab.addMessage({
        from: PeerCursor.myCursor.userId,
        name: 'ゲームマスター',
        text,
        timestamp: Date.now(),
        sendFrom: PeerCursor.myCursor.identifier,
      });
    }

    beforeEach(() => {
      if (!ObjectStore.instance.get(PeerCursor.myCursor.identifier)) PeerCursor.myCursor.initialize();
    });

    it('gives it the place the room own notices get, under the speaker own picture', () => {
      gameMasterSpeaks('では、判定をどうぞ');
      createComponent();

      const above = component.systemSpeaker();
      expect(above).not.toBeNull();
      expect(above?.speakerName).toBe('ゲームマスター');
      expect(above?.isSpeaker).toBe(true);
      // Not spoken in the scene, so no balloon and no window at the foot of the screen.
      expect(component.speechLayout()).toBeNull();
      expect(component.bubbleAnchor()).toBeNull();
    });

    it('leaves a character line alone', () => {
      PeerCursor.myCursor.role = PeerRole.GameMaster;
      TestBed.inject(ObjectChangeService).notifyChanged(PeerCursor.myCursor.identifier);
      addMessage('やあ', 'アリス', addImage());
      createComponent();

      expect(component.systemSpeaker()).toBeNull();
      expect(component.speechLayout()).toBe('bubble');
    });
  });
  describe('taking leave with a line', () => {
    it('keeps the portrait for that line and lets it go on the next', () => {
      const image = addImage();
      addMessage('またね 〔退場〕', 'アリス', image);
      addMessage('行ってしまった', 'ボブ', addImage());
      createComponent();

      TestBed.inject(VisualNovelPlaybackService).jumpTo(0);
      fixture.detectChanges();
      expect(component.stageCharacters().map((chara) => chara.name)).toContain('アリス');
      expect(component.stageCharacters().find((chara) => chara.name === 'アリス')?.isLeaving).toBe(true);

      component.toLatest();
      fixture.detectChanges();
      expect(component.stageCharacters().map((chara) => chara.name)).not.toContain('アリス');
    });

    it('holds the fade back until the words are all there', () => {
      addMessage('またね 〔退場〕', 'アリス', addImage());
      createComponent();
      TestBed.inject(VisualNovelSettingsService).setTypewriterSpeed('slow');
      fixture.detectChanges();

      expect(component.isTyping()).toBe(true);
      expect(component.isLeavingLine()).toBe(false);

      component.userAdvance();
      fixture.detectChanges();
      expect(component.isTyping()).toBe(false);
      expect(component.isLeavingLine()).toBe(true);
    });

    it('does not fade for a reader who asked for less motion', () => {
      addMessage('またね 〔退場〕', 'アリス', addImage());
      createComponent();
      TestBed.inject(VisualNovelSettingsService).setReduceMotion(true);
      fixture.detectChanges();

      expect(component.isLeavingLine()).toBe(false);
    });
  });
  describe('speaking from above', () => {
    it('offers nobody but the cast to a player', () => {
      addMessage('やあ', 'アリス', addImage());
      createComponent();

      expect(component.speakerOptions().map((option) => option.identifier)).not.toContain(
        PeerCursor.myCursor.identifier
      );
    });

    it('lets the game master send a line as themselves without leaving novel mode', () => {
      addMessage('やあ', 'アリス', addImage());
      createComponent();
      PeerCursor.myCursor.role = PeerRole.GameMaster;
      TestBed.inject(ObjectChangeService).notifyChanged(PeerCursor.myCursor.identifier);
      fixture.detectChanges();

      // First, so it is not hunted for among a long cast.
      expect(component.speakerOptions()[0].identifier).toBe(PeerCursor.myCursor.identifier);
    });

    it('takes the offer away again once the role is given up', () => {
      addMessage('やあ', 'アリス', addImage());
      createComponent();
      const objectChange = TestBed.inject(ObjectChangeService);
      PeerCursor.myCursor.role = PeerRole.GameMaster;
      objectChange.notifyChanged(PeerCursor.myCursor.identifier);
      expect(component.speakerOptions()).toHaveLength(2);

      PeerCursor.myCursor.role = PeerRole.Player;
      objectChange.notifyChanged(PeerCursor.myCursor.identifier);

      expect(component.speakerOptions()).toHaveLength(1);
    });
  });
});
