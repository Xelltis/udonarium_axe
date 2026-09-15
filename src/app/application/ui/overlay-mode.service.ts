import { DOCUMENT, inject, Injectable, signal } from '@angular/core';
import { parseInviteLink } from '@axe/domain/peer/invite-link';
import { PeerRole } from '@axe/domain/peer/peer-role';

export const OVERLAY_BODY_CLASS = 'overlay-mode';

/**
 * A screen to lay over a stream.
 *
 * No board, no panels, no background — only speech and turns, for pasting into a browser source.
 *
 * Unlike novel mode it does **not** sync: syncing would switch the whole table's screens
 * for the sake of one window opened to stream from. It stays local to this device.
 *
 * The invitation link is the only way in, so the role comes from the link **before** the screen is built.
 * Waiting for the room would flash the table on the stream before it switched.
 */
@Injectable({ providedIn: 'root' })
export class OverlayModeService {
  private readonly document = inject(DOCUMENT);
  private readonly _active = signal(false);
  private _requestedRole: PeerRole = PeerRole.Guest;

  readonly active = this._active.asReadonly();

  /** The role the link names. Until the room is joined, assume the narrower view. */
  get requestedRole(): PeerRole {
    return this._requestedRole;
  }

  constructor() {
    const params = parseInviteLink(this.document.location?.hash ?? '');
    if (!params?.overlay) return;
    this._requestedRole = params.role ?? PeerRole.Guest;
    this.activate();
  }

  /**
   * Switches this device into overlay mode by marking the document body. It stays on for the life
   * of the page and is never synced.
   */
  activate(): void {
    if (this._active()) return;
    this._active.set(true);
    this.document.body.classList.add(OVERLAY_BODY_CLASS);
  }
}
