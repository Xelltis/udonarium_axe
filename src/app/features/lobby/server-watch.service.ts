import { Injectable, signal } from '@angular/core';
import { Network } from '@axe/core/network/network';
import { networkSend } from '@axe/core/network/network-messaging';
import { AuthorityEvent, ServerRole } from '@axe/core/network/server/server-protocol';

/**
 * Lets someone logged in to a room server step out to watch the room as a guest, and come back to
 * the role the room keeps for them.
 *
 * The room server keeps both the role and the watching, and tells the seat the role it keeps as it
 * comes in and whenever its role changes, so nothing is kept here: a seat watching comes in again
 * watching, on every tab and device of the same login.
 */
@Injectable({ providedIn: 'root' })
export class ServerWatchService {
  /** Counts the times the room server told the seat of another role, for what reads it to follow. */
  private readonly roleTold = signal(0);

  /**
   * Takes in that the room server told the seat of another role, or of another one it keeps for it,
   * which nothing else on the page may change with: a GM making a seat that watches a guest.
   */
  noteRoleTold(): void {
    this.roleTold.update((told) => told + 1);
  }

  /**
   * The role the seat may choose besides watching: the one the room keeps for it. Null where it has
   * no choice: away from a room server's room, not logged in, or made a guest by the room.
   */
  roleToChoose(): ServerRole | null {
    this.roleTold();
    if (Network.transport !== 'server' || !Network.peerContext.isRoom) return null;
    const kept = Network.keptRole;
    return kept && kept !== 'guest' ? kept : null;
  }

  /**
   * Steps out to watch the room as a guest, keeping the role to come back to. Asked even while the
   * seat watches already, as the role told here may be behind the server's, which lets the request
   * go by without counting it then.
   */
  watch(): void {
    if (this.roleToChoose()) this.ask('guest');
  }

  /** Comes back from watching to the role the room keeps for the seat, asked as `watch` is. */
  comeBack(): void {
    const kept = this.roleToChoose();
    if (kept) this.ask(kept);
  }

  private ask(role: ServerRole): void {
    const authority = Network.authorityPeerId;
    if (authority) networkSend(AuthorityEvent.ROLE_REQUEST, { peerId: Network.peerId, role }, authority);
  }
}
