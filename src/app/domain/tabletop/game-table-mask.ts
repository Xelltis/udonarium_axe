import { getPeerContext, getPeerContexts } from '@axe/core/network/peer-context-source';
import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { appendPieceDataElements } from '@axe/domain/tabletop/piece-data-elements';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';

@SyncObject('table-mask')
export class GameTableMask extends TabletopObject {
  @SyncVar() isLock: boolean = false;
  @SyncVar() dispLockMark: boolean = true;

  @SyncVar() owner: string = '';
  @SyncVar() scratchingGrids: string = '';
  @SyncVar() scratchedGrids: string = '';
  //  @SyncVar() isScratchPreviewOnGMMode = false;
  @SyncVar() isPreview = false;

  /** How many grid cells wide the mask is, kept in its common data. */
  get width(): number {
    return this.getCommonValue('width', 1);
  }
  /** How many grid cells tall the mask is, kept in its common data. */
  get height(): number {
    return this.getCommonValue('height', 1);
  }

  /**
   * The `value` of the mask's `color` element; `#555555` when there is none. Setting it does
   * nothing on a mask without that element.
   *
   * The mask is filled with `bgcolor`, the same element's current value, and map painting writes the
   * two together. Nothing in the app reads this getter except the mask component's `color`, and
   * nothing reads that.
   */
  get color(): string {
    const element = this.getElement('color', this.commonDataElement);
    return element ? `${element.value}` : '#555555';
  }
  set color(color: string) {
    this.setCommonValue('color', color);
  }

  /**
   * The fill shown where the mask has no picture, kept as the current value of its colour element;
   * `#0a0a0a` when there is none.
   *
   * Setting it does nothing on a mask without a colour element.
   */
  get bgcolor(): string {
    const element = this.getElement('color', this.commonDataElement);
    return element ? `${element.currentValue}` : '#0a0a0a';
  }
  set bgcolor(bgcolor: string) {
    const element = this.getElement('color', this.commonDataElement);
    if (element) element.currentValue = bgcolor;
  }

  /**
   * The display name of the user who owns the mask, or empty when nobody does or no peer cursor
   * carries that user.
   */
  get ownerName(): string {
    const object = PeerCursor.findByUserId(this.owner);
    return object ? object.name : '';
  }

  /** The colour of the owner badge, which for a mask is always a dark grey. */
  get ownerColor(): string {
    return '#444444';
  }

  /** Whether some user has claimed the mask. */
  get hasOwner(): boolean {
    return this.owner.length > 0;
  }
  /** Whether the owner is connected right now, judged against this client and its current peers. */
  get ownerIsOnline(): boolean {
    return this.isOwnerOnline(getPeerContext(), getPeerContexts());
  }
  /**
   * Whether the owner is connected, given this client's own context and those of its peers.
   *
   * False when the mask has no owner. Peers are matched to users through their peer cursors.
   */
  isOwnerOnline(
    self: { userId: string; isOpen: boolean },
    peerContexts: { peerId: string; userId?: string; isOpen: boolean }[]
  ): boolean {
    if (!this.hasOwner) return false;
    return (
      (self.userId === this.owner && self.isOpen) ||
      peerContexts.some((context) => {
        const cursor = PeerCursor.findByPeerId(context.peerId);
        return cursor && cursor.userId === this.owner && context.isOpen;
      })
    );
  }

  /** Whether the mask is owned by this client's user. */
  get isMine(): boolean {
    return this.isOwnedBy(getPeerContext().userId);
  }
  /** Whether the mask is owned by the given user id. */
  isOwnedBy(userId: string): boolean {
    return userId === this.owner;
  }

  /**
   * Makes a mask with its name, size and opacity data, and registers it for sync. Without an
   * identifier a new one is generated.
   */
  static create(name: string, width: number, height: number, opacity: number, identifier?: string): GameTableMask {
    let object: GameTableMask;

    if (identifier) {
      object = new GameTableMask(identifier);
    } else {
      object = new GameTableMask();
    }
    object.createDataElements();

    appendPieceDataElements(object, name, { width, height }, opacity);
    object.initialize();

    return object;
  }
}
