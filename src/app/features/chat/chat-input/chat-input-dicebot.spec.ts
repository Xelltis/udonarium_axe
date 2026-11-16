import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { DiceBot } from '@axe/domain/dice/dice-bot';
import { ChatInputDiceBotHelper } from '@axe/features/chat/chat-input/chat-input-dicebot';
import { installPanelLayer } from '@axe/testing/panel-layer';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { TextViewComponent } from '@axe/ui/components/text-view/text-view.component';

describe('ChatInputDiceBotHelper', () => {
  let helper: ChatInputDiceBotHelper;
  const catalogue = [
    { id: 'Cthulhu', name: 'クトゥルフ神話TRPG' },
    { id: 'SwordWorld2.5', name: 'ソード・ワールド2.5' },
  ] as (typeof DiceBot.diceBotInfos)[number][];

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    helper = TestBed.runInInjectionContext(() => new ChatInputDiceBotHelper());
  });

  afterEach(() => vi.restoreAllMocks());

  it('knows a game system the catalogue lists, and not one it does not', () => {
    expect(helper.isGameTypeInList('Cthulhu', catalogue)).toBe(true);
    expect(helper.isGameTypeInList('NoSuchSystem', catalogue)).toBe(false);
  });

  it('counts every game system as known while the catalogue has not arrived', () => {
    expect(helper.isGameTypeInList('NoSuchSystem', [])).toBe(true);
  });

  it('starts fetching the dice bot of a game system as it is picked', () => {
    const fetched = vi.spyOn(DiceBot, 'getHelpMessage').mockResolvedValue('');

    helper.load('Cthulhu');

    expect(fetched).toHaveBeenCalledWith('Cthulhu');
  });

  it('opens the dice bot’s help in a text panel at the pointer, once it is fetched', async () => {
    vi.spyOn(DiceBot, 'getHelpMessage').mockResolvedValue('ヘルプの本文');
    TestBed.inject(PointerDeviceService).primeForContextMenu(120, 80);
    const view = { title: '', text: '' };
    const open = vi.spyOn(TestBed.inject(PanelService), 'open').mockReturnValue(view as never);
    const t = TestBed.inject(TRANSLATE_FN);

    helper.showHelp('NoSuchSystem');
    await Promise.resolve();
    await Promise.resolve();

    const title = t('feature.chat.diceBot.title') + t('feature.chat.diceBot.descSuffix');
    expect(open).toHaveBeenCalledWith(TextViewComponent, expect.objectContaining({ title, width: 600, height: 500 }));
    expect(view.title).toBe(title);
    expect(view.text).toBe(t('feature.chat.diceBot.intro') + 'ヘルプの本文');
  });

  it('shows the fetched help in the panel it opens', async () => {
    vi.spyOn(DiceBot, 'getHelpMessage').mockResolvedValue('ヘルプの本文');
    TestBed.inject(PointerDeviceService).primeForContextMenu(120, 80);
    const closePanelLayer = installPanelLayer();
    try {
      helper.showHelp('NoSuchSystem');
      await Promise.resolve();
      await Promise.resolve();
      await TestBed.inject(ApplicationRef).whenStable();

      expect(document.querySelector('text-view')?.textContent).toContain('ヘルプの本文');
    } finally {
      closePanelLayer();
    }
  });
});
