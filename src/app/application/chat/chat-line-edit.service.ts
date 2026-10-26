import { inject, Injectable } from '@angular/core';
import { ChatClockService } from '@axe/application/chat/chat-clock.service';
import { calcChatTimestamp } from '@axe/application/chat/chat-message-helpers';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { canRoleViewTab } from '@axe/domain/chat/chat-tab-permission';
import { dieRollTag } from '@axe/domain/chat/die-roll-tag';
import { mayBeChosen } from '@axe/domain/peer/chosen-seat';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';

/**
 * What this reader may do to a line already said, and the doing of it: showing a kept-back roll,
 * editing it, whispering it to somebody after the fact, and deleting it.
 */
@Injectable({ providedIn: 'root' })
export class ChatLineEditService {
  private readonly objectStore = inject(ObjectStore);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly chatTabList = inject(ChatTabList);
  private readonly clock = inject(ChatClockService);

  /**
   * Opens the latest kept-back roll of a die to the table, across every tab.
   *
   * Answers how many were opened: 1, or 0 when the die has no kept-back roll or this reader may not
   * show it.
   */
  discloseDieRolls(dieIdentifier: string): number {
    const tag = dieRollTag(dieIdentifier);
    let latest: ChatMessage | null = null;
    for (const chatTab of this.chatTabList.chatTabs) {
      for (const message of chatTab.chatMessages) {
        if (!message.isSecret || !message.tags.includes(tag)) continue;
        if (!latest || latest.placedAt < message.placedAt) latest = message;
      }
    }
    if (!latest || !this.canDiscloseMessage(latest)) return 0;

    this.discloseMessage(latest);
    return 1;
  }

  /**
   * Whether this reader may show a kept-back roll to the table.
   *
   * Whoever rolled it may, since it was theirs to keep back, and the master may, since a roll
   * nobody can be made to show is a roll the master cannot rule on. Nobody else: a die kept
   * back is the one thing a seat holds against the rest of the table.
   */
  canDiscloseMessage(message: ChatMessage): boolean {
    if (!message.isSecret || this.keptFromWriting(message)) return false;
    return message.isSendFromSelf || this.rolePermission.canSeeHidden();
  }

  /** Whether this reader may edit a line: one they said, where they may still write to it. */
  canEditMessage(message: ChatMessage): boolean {
    return message.changeable && !this.keptFromWriting(message);
  }

  /**
   * Whether this reader may not write to a line where it stands, whatever else allows it: on a room
   * server a guest writes only in a tab guests may speak in, and the server puts back any change
   * elsewhere. Among peers nothing is held back.
   */
  private keptFromWriting(message: ChatMessage): boolean {
    if (!PeerCursor.isMyselfKeptOffTable) return false;
    const tab = message.parent;
    return !(tab instanceof ChatTab) || !tab.guestCanSpeak;
  }

  /**
   * Shows a kept-back line to the table and moves it to the end of its tab, stamped with when it
   * was shown.
   *
   * Does nothing for a line this reader may not disclose.
   */
  discloseMessage(message: ChatMessage): void {
    if (!this.canDiscloseMessage(message)) return;
    message.tag = message.tags.filter((tag) => tag !== 'secret').join(' ');
    const chatTab = message.parent;
    if (!(chatTab instanceof ChatTab)) return;
    message.disclosedAt = calcChatTimestamp(this.clock.now(), chatTab.latestTimeStamp);
    chatTab.appendChild(message);
  }

  /**
   * Whether this reader may make the line an after-the-fact whisper, or whisper one to somebody
   * else: they said it to everyone, and it is not a notice from the tool.
   *
   * A dice result is the dice bot's line, so a roll stays where the table saw it, and a line
   * whispered from the start is a whisper already.
   */
  canMakeAfterWhisper(message: ChatMessage): boolean {
    if (message.isDirect && !message.isAfterWhisper) return false;
    return this.canEditMessage(message);
  }

  /** Whether this reader may put a line they made an after-the-fact whisper back where it was. */
  canUndoAfterWhisper(message: ChatMessage): boolean {
    return message.isAfterWhisper && this.canEditMessage(message);
  }

  /**
   * The seats a line can be whispered to afterwards: everyone in the room but this reader, who said
   * it and keeps it either way, but those whose role may not read the tab it is in, who could never
   * see it, and but those who may not be chosen.
   */
  afterWhisperCandidates(message: ChatMessage): PeerCursor[] {
    const me = PeerCursor.myCursor;
    const tab = message.parent;
    return this.objectStore
      .getObjects(PeerCursor)
      .filter((peer) => peer !== me && !!peer.userId && mayBeChosen(peer))
      .filter((peer) => !(tab instanceof ChatTab) || canRoleViewTab(tab, peer.role));
  }

  /**
   * Makes a line an after-the-fact whisper to one seat, which with the speaker are then the only ones
   * it reaches. Does nothing for a line this reader may not, or for a seat not in the room.
   */
  makeAfterWhisper(message: ChatMessage, peer: PeerCursor): void {
    if (!this.canMakeAfterWhisper(message)) return;
    if (!this.afterWhisperCandidates(message).includes(peer)) return;
    message.makeAfterWhisper(peer.userId, peer.name, this.clock.now());
  }

  /** Puts an after-the-fact whisper back where it was. Does nothing for a line this reader may not put back. */
  undoAfterWhisper(message: ChatMessage): void {
    if (!this.canUndoAfterWhisper(message)) return;
    message.undoAfterWhisper();
  }

  /**
   * Whether this reader may delete the line: they said it, and it is not a notice from the tool. A
   * dice result is the dice bot's line, so a roll stays where the table saw it.
   */
  canPseudoDelete(message: ChatMessage): boolean {
    return !message.isPseudoDeleted && this.canEditMessage(message);
  }

  /**
   * Deletes a line from everybody's chat as though it had never been said, leaving it in the room's
   * data and its log; it is a pseudo-deletion, which is not put back. Does nothing for a line this
   * reader may not delete.
   */
  pseudoDelete(message: ChatMessage): void {
    if (!this.canPseudoDelete(message)) return;
    message.pseudoDelete(this.clock.now());
  }
}
