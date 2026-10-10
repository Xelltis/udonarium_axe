import { inject } from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { PanelOption, PanelService } from '@axe/application/ui/panel.service';
import { DiceBot } from '@axe/domain/dice/dice-bot';
import { TextViewComponent } from '@axe/ui/components/text-view/text-view.component';

export class ChatInputDiceBotHelper {
  private readonly pointerDeviceService = inject(PointerDeviceService);
  private readonly panelService = inject(PanelService);
  private readonly t = inject(TRANSLATE_FN);

  gameHelp = '';

  /**
   * Starts fetching the dice bot for a game system ahead of time, so the first roll with it does
   * not wait on the download.
   */
  load(gameType: string): void {
    DiceBot.getHelpMessage(gameType).then(() => {});
  }

  /**
   * Whether the game system is one the dice bot catalogue knows.
   *
   * An empty catalogue counts as knowing everything, so no warning shows while it is still loading.
   */
  isGameTypeInList(gameType: string, diceBotInfos: readonly (typeof DiceBot.diceBotInfos)[number][]): boolean {
    if (diceBotInfos.length === 0) return true;
    return diceBotInfos.some((info) => info.id === gameType);
  }

  /**
   * Opens a text panel at the pointer with the dice bot's help for the game system, once its help
   * has been fetched.
   */
  showHelp(gameType: string): void {
    DiceBot.getHelpMessage(gameType).then((help) => {
      this.gameHelp = help;
      let gameName = this.t('feature.chat.diceBot.title');
      for (const diceBotInfo of DiceBot.diceBotInfos) {
        if (diceBotInfo.id === gameType)
          gameName = this.t('feature.chat.diceBot.titleWith', { name: diceBotInfo.name });
      }
      gameName += this.t('feature.chat.diceBot.descSuffix');
      const coordinate = this.pointerDeviceService.pointers[0];
      const option: PanelOption = { title: gameName, left: coordinate.x, top: coordinate.y, width: 600, height: 500 };
      const textView = this.panelService.open(TextViewComponent, option);
      textView.title = gameName;
      textView.text = this.t('feature.chat.diceBot.intro') + this.gameHelp;
    });
  }
}
