import { TestBed } from '@angular/core/testing';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { ChatSpeakerService } from '@axe/application/chat/chat-speaker.service';
import { ScenarioTextService } from '@axe/application/chat/scenario-text.service';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { ScenarioText } from '@axe/domain/scenario-text/scenario-text';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('ScenarioTextService', () => {
  let service: ScenarioTextService;
  let main: ChatTab;
  let secret: ChatTab;

  function textOf(fields: Partial<ScenarioText>): ScenarioText {
    const text = Object.assign(new ScenarioText(), fields);
    text.initialize();
    return text;
  }

  beforeEach(() => {
    localStorage.clear();
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.role = PeerRole.GameMaster;
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    service = TestBed.inject(ScenarioTextService);
    main = new ChatTab();
    main.name = 'メイン';
    main.initialize();
    secret = new ChatTab();
    secret.name = '情報';
    secret.initialize();
    ChatTabList.instance.addChatTab(main);
    ChatTabList.instance.addChatTab(secret);
  });

  afterEach(() => {
    PeerCursor.myCursor = null!;
    vi.restoreAllMocks();
  });

  it('says a text under its title, word for word, in the tab it names', () => {
    const text = textOf({ title: '古い屋敷', text: '**扉**が軋む。', tab: secret.identifier });

    const message = service.send(text)!;

    expect(message.name).toBe('古い屋敷');
    expect(message.text).toBe('**扉**が軋む。');
    expect(message.parent).toBe(secret);
  });

  it('says it as the character being spoken as, or under its title where there is none', () => {
    const hero = GameCharacter.create('ヒロ', 1, '');
    const text = textOf({ title: '独白', text: 'ここはどこだ', sendAs: 'character' });

    expect(service.send(text)!.name).toBe('独白');

    TestBed.inject(ChatSpeakerService).set(hero.identifier);
    expect(service.send(text)!.name).toBe('ヒロ');
  });

  it('whispers it to the players asked for, and as the room where asked', () => {
    const verbatim = vi.spyOn(TestBed.inject(ChatMessageService), 'sendVerbatim');
    const text = textOf({ title: '密書', text: 'あなただけに' });

    service.send(text, { speaker: 'system', to: ['cursor-1'] });

    expect(verbatim).toHaveBeenCalledWith(
      expect.any(ChatTab),
      'あなただけに',
      { kind: 'system' },
      { to: ['cursor-1'] }
    );
  });

  it('says nothing for a player, nor a text with no words', () => {
    expect(service.send(textOf({ title: '空', text: '  ' }))).toBeNull();

    PeerCursor.myCursor.role = PeerRole.Player;
    expect(service.send(textOf({ title: '描写', text: '雨' }))).toBeNull();
    expect(service.create('新しい')).toBeNull();
  });

  it('remembers on this browser when each text was said, in this room', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000);
    const text = textOf({ title: '描写', text: '雨' });

    expect(service.sentAt(text.identifier)).toBeNull();
    service.send(text);

    expect(service.sentAt(text.identifier)).toBe(1_000);
    expect(JSON.parse(localStorage.getItem('axe.scenario-text.sent') ?? '{}')).toEqual({ [text.identifier]: 1_000 });
  });

  it('copies a text under another title, after the last', () => {
    const text = textOf({ title: '描写', text: '雨', folderName: '第1話', order: 3, sendAs: 'system' });

    const copy = service.duplicate(text, '描写のコピー')!;

    expect([copy.title, copy.text, copy.folderName, copy.sendAs]).toEqual(['描写のコピー', '雨', '第1話', 'system']);
    expect(copy.order).toBeGreaterThan(3);
  });
});
