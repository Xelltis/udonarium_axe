import { TranslateFn } from '@axe/application/i18n/translate.token';
import { ContextMenuAction, ContextMenuSeparator } from '@axe/application/ui/context-menu.service';
import { ChatBookmarkKind } from '@axe/domain/chat/chat-bookmark';

/** What the reader may do with one line, as the line works it out. */
export interface ChatMessageMenuState {
  canInteract: boolean;
  canShareAsMemo: boolean;
  canChange: boolean;
  /** The kinds of mark the reader may put on the line or take off, with whether it carries each. */
  bookmarkKinds: readonly { kind: ChatBookmarkKind; isBookmarked: boolean }[];
  /** The seats the line may be whispered to afterwards, or null where the reader may not. */
  afterWhisperTargets: readonly { identifier: string; name: string }[] | null;
  /** Whether the reader may put an after-the-fact whisper back for everyone. */
  canUndoAfterWhisper: boolean;
  /** Whether the reader may delete the line from the chat, leaving it in the log. */
  canPseudoDelete: boolean;
  canShowInTicker: boolean;
  /** The tabs the line may be said again in; empty where it may not be copied. */
  copyTargets: readonly { identifier: string; name: string }[];
  /** Whether the line answers or quotes another one the reader is shown, to be followed back to. */
  hasOriginal: boolean;
  /** Whether earlier wordings of the line were kept, and whether they are open under it. */
  hasHistory: boolean;
  isHistoryOpen: boolean;
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
  toggleBookmark: (kind: ChatBookmarkKind) => void;
  whisperTo: (peerIdentifier: string) => void;
  undoAfterWhisper: () => void;
  pseudoDelete: () => void;
  showInTicker: () => void;
  toggleHistory: () => void;
  jumpToOriginal: () => void;
  copyText: (text: string) => void;
  selectText: () => void;
}

/**
 * What can be done with a line said in chat, grouped by what it is for and parted by separators.
 *
 * The groups run from what is reached for most to what cannot be taken back: answering the line,
 * its words, keeping it and passing it on, reading round it, the speaker's own changes to it, and
 * last, kept apart from the rest, deleting it. The toolbar over the line holds the first few of
 * these and opens this same menu from its last button, and a touch screen reaches it by a press
 * held on the line.
 *
 * Where some of the words were picked out, copying takes just those. On a touch screen picking the
 * words out is offered too, for copying a part of them or handing them to the system's own actions.
 */
export function buildChatMessageContextMenu(
  state: ChatMessageMenuState,
  callbacks: ChatMessageMenuCallbacks,
  t: TranslateFn
): ContextMenuAction[] {
  const answer: ContextMenuAction[] = [];
  if (state.canInteract) {
    answer.push({ name: t('feature.chat.message.reply'), action: () => callbacks.reply() });
    answer.push({ name: t('feature.chat.message.quote'), action: () => callbacks.quote() });
  }

  const words: ContextMenuAction[] = [];
  if (state.text.length > 0) {
    const copied = state.selectedText.trim().length > 0 ? state.selectedText : state.text;
    words.push({ name: t('feature.chat.message.copyText'), action: () => callbacks.copyText(copied) });
    if (state.isTouch) {
      words.push({ name: t('feature.chat.message.selectText'), action: () => callbacks.selectText() });
    }
  }

  const keep: ContextMenuAction[] = [...buildChatBookmarkMenu(state.bookmarkKinds, callbacks.toggleBookmark, t)];
  if (state.canInteract && state.canShareAsMemo) {
    keep.push({ name: t('feature.chat.message.shareAsMemo'), action: () => callbacks.shareAsMemo() });
  }
  if (state.canInteract && state.copyTargets.length > 0) {
    keep.push({
      name: t('feature.chat.message.copyToTab'),
      subActions: state.copyTargets.map((tab) => ({
        name: tab.name,
        action: () => callbacks.copyToTab(tab.identifier),
      })),
    });
  }
  if (state.canShowInTicker) {
    keep.push({ name: t('feature.chat.message.ticker'), action: () => callbacks.showInTicker() });
  }

  const read: ContextMenuAction[] = [];
  if (state.hasOriginal) {
    read.push({ name: t('feature.chat.message.jumpToOriginal'), action: () => callbacks.jumpToOriginal() });
  }
  if (state.hasHistory) {
    const name = t(`feature.chat.message.history.${state.isHistoryOpen ? 'close' : 'open'}`);
    read.push({ name, action: () => callbacks.toggleHistory() });
  }

  const own: ContextMenuAction[] = [];
  if (state.canChange) {
    own.push({ name: t('feature.chat.message.edit'), action: () => callbacks.edit() });
  }
  if (state.afterWhisperTargets) {
    const targets = state.afterWhisperTargets;
    own.push(
      targets.length > 0
        ? {
            name: t('feature.chat.message.afterWhisper'),
            subActions: targets.map((peer) => ({
              name: peer.name,
              action: () => callbacks.whisperTo(peer.identifier),
            })),
          }
        : { name: t('feature.chat.message.afterWhisperNobody'), enabled: false }
    );
  }
  if (state.canUndoAfterWhisper) {
    own.push({ name: t('feature.chat.message.undoAfterWhisper'), action: () => callbacks.undoAfterWhisper() });
  }

  const remove: ContextMenuAction[] = [];
  if (state.canPseudoDelete) {
    remove.push({ name: t('feature.chat.message.deleteLine'), action: () => callbacks.pseudoDelete() });
  }

  return [answer, words, keep, read, own, remove]
    .filter((group) => group.length > 0)
    .flatMap((group, index) => (index === 0 ? group : [ContextMenuSeparator, ...group]));
}

/**
 * Putting on or taking off each kind of mark the reader may, as the toolbar's bookmark button offers
 * it and as the line's menu offers it among what keeps the line: the room's mark, then the
 * reader's own.
 */
export function buildChatBookmarkMenu(
  kinds: ChatMessageMenuState['bookmarkKinds'],
  toggle: (kind: ChatBookmarkKind) => void,
  t: TranslateFn
): ContextMenuAction[] {
  return kinds.map(({ kind, isBookmarked }) => ({
    name: t(`feature.chat.message.bookmarks.${kind}.${isBookmarked ? 'remove' : 'add'}`),
    action: () => toggle(kind),
  }));
}
