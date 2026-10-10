import { TranslateFn } from '@axe/application/i18n/translate.token';
import { ContextMenuAction, ContextMenuSeparator } from '@axe/application/ui/context-menu.service';
import { Network } from '@axe/core/index';
import {
  canClaimOwnership,
  canEditDisclosure,
  Disclosable,
  DisclosureMode,
  normalizeDisclosureMode,
  toggleDisclosureUserId,
} from '@axe/domain/disclosure/disclosure';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { canRoleEdit } from '@axe/domain/peer/peer-role';

interface DisclosableObject extends Disclosable {
  owner?: string;
  update(): void;
}

interface DisclosureCandidate {
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

function audienceCandidates(): DisclosureCandidate[] {
  const result: DisclosureCandidate[] = [];
  for (const context of Network.peerContexts) {
    const cursor = PeerCursor.findByPeerId(context.peerId);
    if (!cursor || cursor.isMine || cursor.isGameMaster) continue;
    result.push({ userId: cursor.userId, name: candidateName(cursor) });
  }
  return result;
}

function ownerCandidates(): DisclosureCandidate[] {
  const result: DisclosureCandidate[] = [];
  const myCursor = PeerCursor.myCursor;
  if (myCursor) result.push({ userId: myCursor.userId, name: candidateName(myCursor) });
  for (const context of Network.peerContexts) {
    const cursor = PeerCursor.findByPeerId(context.peerId);
    if (!cursor || cursor.isMine) continue;
    result.push({ userId: cursor.userId, name: candidateName(cursor) });
  }
  return result;
}

/**
 * The disclosure and owner entries appended to a piece's right-click menu.
 *
 * Whoever may edit the piece's disclosure gets a submenu of who can see it: everyone, chosen players
 * (listing the connected players who are not game masters) or the game master only. The game master,
 * or a player who may claim the piece, gets a submenu to set its owner. Every choice writes the piece
 * and sends it to the room. Gives an empty list when neither applies, and otherwise leads with a
 * separator.
 */
export function buildDisclosureContextMenu(object: DisclosableObject, t: TranslateFn): ContextMenuAction[] {
  const ownerUserId = object.owner ?? '';
  const myUserId = PeerCursor.myCursor?.userId ?? '';
  const isGameMaster = PeerCursor.isMyselfGameMaster;
  const viewer = { userId: myUserId, isGameMaster, ownerUserId };
  const canEdit = canEditDisclosure(viewer);
  const canClaim = myUserId.length > 0 && canClaimOwnership(viewer) && canRoleEdit(PeerCursor.myRole);
  const showOwnerMenu = isGameMaster || canClaim;
  if (!canEdit && !showOwnerMenu) return [];

  const entries: ContextMenuAction[] = [];

  if (canEdit) {
    const mode = normalizeDisclosureMode(object.disclosureMode);
    const selectedSubActions: ContextMenuAction[] = audienceCandidates().map((peer) => ({
      name: mark(object.disclosureUserIds.includes(peer.userId)) + peer.name,
      action: () => {
        object.disclosureUserIds = toggleDisclosureUserId(object.disclosureUserIds, peer.userId);
        object.disclosureMode = DisclosureMode.Selected;
        object.update();
      },
    }));
    if (!selectedSubActions.length) {
      selectedSubActions.push({ name: t('feature.disclosure.noPlayers'), enabled: false });
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

  if (showOwnerMenu) {
    entries.push({
      name: t('feature.disclosure.owner'),
      subActions: [
        {
          name: mark(ownerUserId === '') + t('feature.disclosure.ownerNone'),
          action: () => {
            object.owner = '';
            object.update();
          },
        },
        ...ownerCandidates().map((peer) => ({
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
