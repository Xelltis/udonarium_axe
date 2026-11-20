import { TranslateFn } from '@axe/application/i18n/translate.token';
import type { DisclosureService } from '@axe/application/permission/disclosure.service';
import { ContextMenuAction, ContextMenuSeparator } from '@axe/application/ui/context-menu.service';
import { Network } from '@axe/core/network/network';
import { Card } from '@axe/domain/card/card';
import {
  Disclosable,
  DisclosureMode,
  normalizeDisclosureMode,
  toggleDisclosureUserId,
} from '@axe/domain/disclosure/disclosure';
import { mayBeChosen, mayBeOffered } from '@axe/domain/peer/chosen-seat';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { heldToGameMasterByServer } from '@axe/domain/peer/server-held';
import { ownerRuledByServer } from '@axe/domain/tabletop/withheld';

interface DisclosableObject extends Disclosable {
  owner?: string;
  update(): void;
}

/**
 * Who may change an object's disclosure and who owns it, as {@link DisclosureService} answers it: the
 * menu offers what these answers allow and decides nothing of its own.
 */
export type DisclosureRules = Pick<DisclosureService, 'canEdit' | 'canSetOwner'>;

/** A user an owner or audience choice offers, by user id and the name shown for them. */
export interface DisclosureCandidate {
  userId: string;
  name: string;
}

const CHECKED = '☑ ';
const UNCHECKED = '☐ ';

function mark(active: boolean): string {
  return active ? CHECKED : UNCHECKED;
}

function candidateName(cursor: PeerCursor): string {
  return cursor.name || cursor.userId.slice(0, 6);
}

/**
 * What to say when nobody is there to choose: that those not logged in can't be chosen, when a connected seat
 * was left out for that, and otherwise that no other player is there.
 */
export function noCandidatesKey(): string {
  const leftOut = Network.instance.peerContexts.some((context) => {
    const cursor = PeerCursor.findByPeerId(context.peerId);
    return cursor !== null && !cursor.isMine && !mayBeChosen(cursor);
  });
  return leftOut ? 'feature.disclosure.noLoggedInPlayers' : 'feature.disclosure.noPlayers';
}

function audienceCandidates(object: DisclosableObject): DisclosureCandidate[] {
  const result: DisclosureCandidate[] = [];
  for (const context of Network.instance.peerContexts) {
    const cursor = PeerCursor.findByPeerId(context.peerId);
    if (!cursor || cursor.isMine || cursor.isGameMaster || !mayBeOffered(cursor, object.disclosureUserIds)) continue;
    result.push({ userId: cursor.userId, name: candidateName(cursor) });
  }
  return result;
}

/**
 * Who an owner choice offers, the right-click menu's and the sheet's alike: this user first, then
 * every other connected user who may be chosen or owns the object now, each named by their cursor or
 * a short id.
 *
 * A room server lets anyone but the game master take a note or a die nobody owns for themselves
 * alone, and a card only for themselves or nobody, so there it offers only this user for those,
 * besides the owner the object has now. Who owns anything else is left free.
 */
export function ownerCandidates(object: DisclosableObject): DisclosureCandidate[] {
  const result: DisclosureCandidate[] = [];
  const myCursor = PeerCursor.myCursor;
  if (myCursor) result.push({ userId: myCursor.userId, name: candidateName(myCursor) });
  const owner = object.owner ?? '';
  if (heldToGameMasterByServer() && ownerRuledByServer(object) && (!owner || object instanceof Card)) {
    const holder = owner && owner !== myCursor?.userId ? PeerCursor.findByUserId(owner) : null;
    if (holder) result.push({ userId: holder.userId, name: candidateName(holder) });
    return result;
  }
  for (const context of Network.instance.peerContexts) {
    const cursor = PeerCursor.findByPeerId(context.peerId);
    if (!cursor || cursor.isMine || !mayBeOffered(cursor, [owner])) continue;
    result.push({ userId: cursor.userId, name: candidateName(cursor) });
  }
  return result;
}

/**
 * The disclosure and owner entries appended to a piece's right-click menu.
 *
 * Whoever `rules` lets change the piece's disclosure gets a submenu of who can see it: everyone,
 * chosen players (listing the connected players who are not game masters) or the game master only.
 * Whoever `rules` lets change its owner, the game master, its owner or a seat that may claim it, gets
 * a submenu to set its owner. Every choice writes the piece and sends it to the room. Gives an empty
 * list when neither applies, and otherwise leads with a separator.
 *
 * `clearOwner`, where given, takes the place of plainly clearing the owner: a die kept to a seat is
 * shown through the dice service, which says the face it shows in the chat.
 */
export function buildDisclosureContextMenu(
  object: DisclosableObject,
  t: TranslateFn,
  rules: DisclosureRules,
  clearOwner?: () => void
): ContextMenuAction[] {
  const ownerUserId = object.owner ?? '';
  const canEdit = rules.canEdit(object);
  const canSetOwner = rules.canSetOwner(object);
  if (!canEdit && !canSetOwner) return [];

  const entries: ContextMenuAction[] = [];

  if (canEdit) {
    const mode = normalizeDisclosureMode(object.disclosureMode);
    const selectedSubActions: ContextMenuAction[] = audienceCandidates(object).map((peer) => ({
      name: mark(object.disclosureUserIds.includes(peer.userId)) + peer.name,
      action: () => {
        object.disclosureUserIds = toggleDisclosureUserId(object.disclosureUserIds, peer.userId);
        object.disclosureMode = DisclosureMode.Selected;
        object.update();
      },
    }));
    if (!selectedSubActions.length) {
      selectedSubActions.push({ name: t(noCandidatesKey()), enabled: false });
    }

    entries.push({
      name: t('feature.disclosure.label'),
      subActions: [
        {
          name: mark(mode === DisclosureMode.All) + t('feature.disclosure.all'),
          action: () => {
            object.disclosureMode = DisclosureMode.All;
            object.update();
          },
        },
        {
          name: mark(mode === DisclosureMode.Selected) + t('feature.disclosure.selected'),
          subActions: selectedSubActions,
        },
        {
          name: mark(mode === DisclosureMode.GameMaster) + t('feature.disclosure.gmOnly'),
          action: () => {
            object.disclosureMode = DisclosureMode.GameMaster;
            object.update();
          },
        },
      ],
    });
  }

  if (canSetOwner) {
    entries.push({
      name: t('feature.disclosure.owner'),
      subActions: [
        {
          name: mark(ownerUserId === '') + t('feature.disclosure.ownerNone'),
          action: () => {
            if (clearOwner) {
              clearOwner();
              return;
            }
            object.owner = '';
            object.update();
          },
        },
        ...ownerCandidates(object).map((peer) => ({
          name: mark(ownerUserId === peer.userId) + peer.name,
          action: () => {
            object.owner = peer.userId;
            object.update();
          },
        })),
      ],
    });
  }

  return [ContextMenuSeparator, ...entries];
}
