import { Injectable, signal } from '@angular/core';
import { Network } from '@axe/core/network/network';
import { buildInviteLink } from '@axe/domain/peer/invite-link';
import { PeerRole } from '@axe/domain/peer/peer-role';

/** An invitation the room server signed, and when it runs out. */
export interface ServerInvite {
  readonly invite: string;
  readonly expiresAt: number;
}

/** What the reader chose for the link that invites somebody into the room. */
export interface InviteLinkChoice {
  /** Whether the room's password travels in the link. */
  readonly includePassword: boolean;
  /** The role written into the link, or null where the room server's invitation carries it. */
  readonly role: PeerRole | null;
  /** Whether the link opens the room as an overlay for streaming. */
  readonly overlay: boolean;
  /** The room server's signed invitation, or nothing without one. */
  readonly invite: string;
}

/** How long before it runs out an invitation from the room server is asked for afresh. */
const INVITE_RENEW_MARGIN_MS = 24 * 60 * 60 * 1000;

/** Where an invitation is kept: one for each room and role. */
function inviteKey(roomKey: string | null, role: PeerRole): string {
  return `${roomKey ?? ''}:${role}`;
}

/**
 * The link that invites somebody into the room this seat is in, and the invitations a room server
 * signs for it: asked for once per room and role, held while they last, and asked for afresh when a
 * day is left to run.
 *
 * Provided by the peer menu, one to each, so that the invitations go with the menu that asked.
 */
@Injectable()
export class InviteLinkService {
  private readonly invites = signal<ReadonlyMap<string, ServerInvite>>(new Map());
  /** The invitations being asked for, so a request is not sent again while one is on its way. */
  private readonly asking = new Set<string>();
  private readonly _failed = signal(false);

  /** Whether the room server turned down or did not answer the last request for an invitation. */
  readonly failed = this._failed.asReadonly();

  /** The invitation held for this room in a role, or null without one. Read as a signal. */
  held(role: PeerRole): ServerInvite | null {
    return this.invites().get(inviteKey(Network.instance.roomKey, role)) ?? null;
  }

  /**
   * Asks the room server for an invitation in a role, unless one for that role is in hand with a day
   * still to run or is already being asked for. A refusal or a failure is told by `failed`.
   */
  async request(role: PeerRole): Promise<void> {
    const key = inviteKey(Network.instance.roomKey, role);
    const held = this.invites().get(key);
    if (held && held.expiresAt - Date.now() > INVITE_RENEW_MARGIN_MS) return;
    if (this.asking.has(key)) return;
    this.asking.add(key);
    try {
      const answer = await Network.instance.requestInvite(role);
      if (!answer.invite || answer.expiresAt == null) {
        this._failed.set(true);
        return;
      }
      const invites = new Map(this.invites());
      invites.set(key, { invite: answer.invite, expiresAt: answer.expiresAt });
      this.invites.set(invites);
      this._failed.set(false);
    } catch {
      this._failed.set(true);
    } finally {
      this.asking.delete(key);
    }
  }

  /** Forgets what the last request came to, which says nothing of the next one. */
  forgetFailure(): void {
    this._failed.set(false);
  }

  /** Puts away every invitation held, as for a reader who is no longer the game master. */
  putAway(): void {
    this.invites.set(new Map());
  }

  /** The link into the room this seat is in, as the reader chose it; empty outside a room. */
  link(choice: InviteLinkChoice): string {
    const peer = Network.instance.peerContext;
    if (!peer?.isRoom) return '';
    return buildInviteLink(location.origin + location.pathname, {
      roomId: peer.roomId,
      roomName: peer.roomName,
      roomKey: Network.instance.roomKey ?? '',
      password: choice.includePassword ? peer.password : '',
      role: choice.role,
      overlay: choice.overlay,
      invite: choice.invite,
    });
  }
}
