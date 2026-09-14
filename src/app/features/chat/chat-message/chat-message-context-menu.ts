import { TranslateFn } from '@axe/application/i18n/translate.token';
import { ContextMenuAction, ContextMenuSeparator } from '@axe/application/ui/context-menu.service';

/** What the reader may do with one line, as the line works it out. */
export interface ChatMessageMenuState {
  canInteract: boolean;
  canShareAsMemo: boolean;
  canChange: boolean;
  canShowInTicker: boolean;
  /** The tabs the line may be said again in; empty where it may not be copied. */
  copyTargets: readonly { identifier: string; name: string }[];
  /** Whether the line answers or quotes another one it can be followed back to. */
  hasOriginal: boolean;
  /** The words of the line as the reader is shown them; empty where they are kept from the reader. */
  text: string;
}

export interface ChatMessageMenuCallbacks {
  reply: () => void;
  quote: () => void;
  copyToTab: (tabIdentifier: string) => void;
  shareAsMemo: () => void;
  edit: () => void;
  showInTicker: () => void;
  jumpToOriginal: () => void;
  copyText: () => void;
}

/**
 * What can be done with a line said in chat.
 *
 * The same actions sit on the line as buttons that only show under a mouse, so a touch screen
 * reaches them through this instead. Only what those buttons would offer is offered, and copying
 * the words is added, since a press held on the line does not pick them out.
 */
export function buildChatMessageContextMenu(
  state: ChatMessageMenuState,
  callbacks: ChatMessageMenuCallbacks,
  t: TranslateFn
): ContextMenuAction[] {
  const actions: ContextMenuAction[] = [];
  if (state.canInteract) {
    actions.push({ name: t('feature.chat.message.reply'), action: () => callbacks.reply() });
    actions.push({ name: t('feature.chat.message.quote'), action: () => callbacks.quote() });
    if (state.copyTargets.length > 0) {
      actions.push({
        name: t('feature.chat.message.copyToTab'),
        subActions: state.copyTargets.map((tab) => ({
          name: tab.name,
          action: () => callbacks.copyToTab(tab.identifier),
        })),
      });
    }
    if (state.canShareAsMemo) {
      actions.push({ name: t('feature.chat.message.shareAsMemo'), action: () => callbacks.shareAsMemo() });
    }
  }
  if (state.canChange) {
    actions.push({ name: t('feature.chat.messageFix.change'), action: () => callbacks.edit() });
  }
  if (state.canShowInTicker) {
    actions.push({ name: t('feature.chat.message.ticker'), action: () => callbacks.showInTicker() });
  }
  if (state.hasOriginal) {
    actions.push({ name: t('feature.chat.message.jumpToOriginal'), action: () => callbacks.jumpToOriginal() });
  }
  if (state.text.length > 0) {
    if (actions.length > 0) actions.push(ContextMenuSeparator);
    actions.push({ name: t('feature.chat.message.copyText'), action: () => callbacks.copyText() });
  }
  return actions;
}
