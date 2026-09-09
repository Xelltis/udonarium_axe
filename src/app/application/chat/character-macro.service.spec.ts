import { TestBed } from '@angular/core/testing';
import { ActiveChatTabService } from '@axe/application/chat/active-chat-tab.service';
import { CharacterMacroService } from '@axe/application/chat/character-macro.service';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('CharacterMacroService', () => {
  let service: CharacterMacroService;
  let chatMessageService: ChatMessageService;
  let sendMessage: ReturnType<typeof vi.spyOn>;
  let tab: ChatTab;

  function character(name: string): GameCharacter {
    return GameCharacter.create(name, 1, '');
  }

  function markOnTable(target: GameCharacter): GameCharacter {
    target.location.name = 'table';
    target.targeted = true;
    return target;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    service = TestBed.inject(CharacterMacroService);
    chatMessageService = TestBed.inject(ChatMessageService);

    tab = new ChatTab('tab-for-macros');
    tab.name = 'メイン';
    tab.initialize();
    ChatTabList.instance.addChatTab(tab);

    sendMessage = vi.spyOn(chatMessageService, 'sendMessage').mockReturnValue(null as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    (ChatTabList as unknown as { _instance: ChatTabList | undefined })._instance = undefined;
  });

  it('speaks as the character, into the tab it was given', () => {
    const speaker = character('術者');

    service.send(speaker, 'こんばんは', { tab });

    expect(sendMessage).toHaveBeenCalledOnce();
    const [sentTab, text, , sendFrom] = sendMessage.mock.calls[0];
    expect(sentTab).toBe(tab);
    expect(text).toBe('こんばんは');
    expect(sendFrom).toBe(speaker.identifier);
  });

  it('falls back to the tab the reader is on, then to the first one there is', () => {
    const speaker = character('術者');
    TestBed.inject(ActiveChatTabService).set(tab.identifier);

    service.send(speaker, 'ただいま');

    expect(sendMessage.mock.calls[0][0]).toBe(tab);
  });

  it('says nothing at all when the room holds no tab to speak into', () => {
    const speaker = character('術者');
    ChatTabList.instance.chatTabs.forEach((held) => held.destroy());

    expect(service.send(speaker, 'どこへ')).toBeNull();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('gathers the marked pieces itself when it is told of none', () => {
    const speaker = character('術者');
    const marked = markOnTable(character('相手'));
    character('見ているだけ');

    service.send(speaker, '攻撃 t:HP-5', { tab });

    const [, text, , , , , , contexts] = sendMessage.mock.calls[0];
    expect(text).toContain(`[${marked.name}]`);
    expect(contexts).toHaveLength(1);
  });

  it('works out the palette variables in the line before it is sent', () => {
    const speaker = character('術者');
    speaker.chatPalette!.setPalette('//威力=7\n2d6+{威力} 攻撃');

    service.send(speaker, '2d6+{威力} 攻撃', { tab });

    expect(sendMessage.mock.calls[0][1]).toBe('2d6+7 攻撃');
  });

  it('takes the colour and the portrait from the character', () => {
    const speaker = character('術者');
    speaker.chatColorCode = ['#111111', '#222222'];

    service.send(speaker, 'いろ', { tab, colorIndex: 1 });

    const [, , , , , portraitIndex, color] = sendMessage.mock.calls[0];
    expect(color).toBe('#222222');
    expect(portraitIndex).toBe(speaker.selectedPortraitIndex);
  });

  it('speaks in the bubble the character wears, so a roll can answer in it', () => {
    const speaker = character('術者');
    speaker.chatBubbleLight = ['#ffeeee', '#eeffee'];
    speaker.chatBubbleDark = ['#330000', '#003300'];

    service.send(speaker, 'ふきだし', { tab, colorIndex: 1 });

    expect(sendMessage.mock.calls[0][11]).toEqual({ light: '#eeffee', dark: '#003300' });
  });

  it('sends no bubble when the caller asks for none, as a notice does', () => {
    const speaker = character('術者');

    service.send(speaker, 'ふきだし無し', { tab, bubbles: null });

    expect(sendMessage.mock.calls[0][11]).toBeUndefined();
  });

  it('says what it was handed without working the references out', () => {
    const speaker = character('術者');

    service.announce(speaker, '毒 を かけた', { tab });

    const [, text, , , , , , contexts] = sendMessage.mock.calls[0];
    expect(text).toBe('毒 を かけた');
    expect(contexts).toBeUndefined();
  });

  it('rolls with the system the chat window is set to', async () => {
    const speaker = character('術者');
    chatMessageService.gameType = 'Cthulhu7th';

    await service.sendAsCharacter(speaker, '2d6', { tab });

    expect((sendMessage.mock.calls[0][2] as { ID: string }).ID).toBe('Cthulhu7th');
  });

  it('lets the caller name a system of its own, over the one the window is set to', async () => {
    const speaker = character('術者');
    chatMessageService.gameType = 'Cthulhu7th';

    await service.sendAsCharacter(speaker, '2d6', { tab, gameType: 'SwordWorld2.5' });

    expect((sendMessage.mock.calls[0][2] as { ID: string }).ID).toBe('SwordWorld2.5');
  });

  it('falls back to the dice bot of the palette where no system has been chosen', async () => {
    const speaker = character('術者');
    speaker.chatPalette!.dicebot = 'Cthulhu7th';
    chatMessageService.gameType = '';

    await service.sendAsCharacter(speaker, '2d6', { tab });

    expect((sendMessage.mock.calls[0][2] as { ID: string }).ID).toBe('Cthulhu7th');
  });
});
