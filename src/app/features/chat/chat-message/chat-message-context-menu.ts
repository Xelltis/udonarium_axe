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
  /** The words picked out inside the line when the menu opened, copied in place of the whole line; empty where none were. */
  selectedText: string;
  /** Whether the pointer is a touch, under which the words of a line are picked out only on asking. */
  isTouch: boolean;
}

export interface ChatMessageMenuCallbacks {
  reply: () => void;
  quote: () => void;
  copyToTab: (tabIdentifier: string) => void;
  shareAsMemo: () => void;
  edit: () => void;
  showInTicker: () => void;
  jumpToOriginal: () => void;
  copyText: (text: string) => void;
  selectText: () => void;
}

/**
 * What can be done with a line said in chat.
 *
 * The same actions sit on the line as buttons that only show under a mouse, so a touch screen
 * reaches them through this instead. Only what those buttons would offer is offered, and copying
 * the words is added, since a press held on the line does not pick them out. Where some of the
 * words were already picked out, copying takes just those. On a touch screen picking the words
 * out is offered too, for copying a part of them or handing them to the system's own actions.
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
    const copied = state.selectedText.trim().length > 0 ? state.selectedText : state.text;
    actions.push({ name: t('feature.chat.message.copyText'), action: () => callbacks.copyText(copied) });
    if (state.isTouch) {
      actions.push({ name: t('feature.chat.message.selectText'), action: () => callbacks.selectText() });
    }
  }
  return actions;
}
