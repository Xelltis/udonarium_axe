import { DestroyRef, inject, Injectable } from '@angular/core';
import { AssetRemovalService } from '@axe/application/file/asset-removal.service';
import { Network } from '@axe/core/network/network';
import { AssetHttpStore } from '@axe/core/storage/asset-http-store';
import { AssetRetries } from '@axe/core/storage/asset-retries';
import { AudioSharingSystem } from '@axe/core/storage/audio-sharing-system';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { ImageSharingSystem } from '@axe/core/storage/image-sharing-system';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { MODEL_TYPE } from '@axe/core/storage/model-file';
import { ModelSharingSystem } from '@axe/core/storage/model-sharing-system';
import { ModelStorage } from '@axe/core/storage/model-storage';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { canRoleEdit } from '@axe/domain/peer/peer-role';

/** How long after somebody leaves the room's list of pictures and sounds is read again. */
const ROOM_ASSET_RELIST_MS = 30_000;

/**
 * Keeps the pictures, sounds and models this seat holds in step with the store of the room
 * server's room it is in: puts up what the seat holds, and fetches what the room holds that the
 * seat lacks. Each step is asked for by the handling of the network's events, which knows when the
 * seat comes in, comes back or is given another role.
 */
@Injectable({ providedIn: 'root' })
export class RoomAssetSyncService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly assetRemoval = inject(AssetRemovalService);
  private readonly imageStorage = inject(ImageStorage);
  private readonly audioStorage = inject(AudioStorage);
  private readonly modelStorage = inject(ModelStorage);
  private readonly assetHttpStore = inject(AssetHttpStore);
  private readonly imageSharingSystem = inject(ImageSharingSystem);
  private readonly audioSharingSystem = inject(AudioSharingSystem);
  private readonly modelSharingSystem = inject(ModelSharingSystem);

  /** The room's list of pictures and sounds, when the server could not give it just then. */
  private readonly listRetries = new AssetRetries();
  private relistTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.imageStorage.receivedUploadTurn = () => this.turnToPutUpReceived();
    this.audioStorage.receivedUploadTurn = () => this.turnToPutUpReceived();
    this.modelStorage.receivedUploadTurn = () => this.turnToPutUpReceived();
    this.destroyRef.onDestroy(() => {
      this.listRetries.clear();
      if (this.relistTimer) clearTimeout(this.relistTimer);
      this.imageStorage.receivedUploadTurn = () => 0;
      this.audioStorage.receivedUploadTurn = () => 0;
      this.modelStorage.receivedUploadTurn = () => 0;
    });
  }

  /**
   * Puts the pictures and sounds this seat holds up to the room server's room it is in, as a GM or a
   * PL may: those added outside the room, brought from another, or added while the line was down. A
   * guest, who may put nothing up, names them to the others instead, for them to take from it.
   */
  bringIntoRoom(): void {
    const role = Network.serverRole;
    if (!Network.peerContext.isRoom) return;
    if (role !== 'gm' && role !== 'pl') {
      if (role === 'guest') {
        this.imageStorage.synchronize();
        this.audioStorage.synchronize();
        this.modelStorage.synchronize();
      }
      return;
    }
    this.imageStorage.uploadAllToAssetStore();
    this.audioStorage.uploadAllToAssetStore();
    this.modelStorage.uploadAllToAssetStore();
    // What the room is playing goes up ahead of the rest, for everyone to hear it soonest.
    this.audioSharingSystem.preferWaiting();
  }

  /**
   * Catches up after coming back on a new link the room server asked for, which some servers do
   * every few minutes: what was added here while the link was down goes up, and the room's list is
   * read again for what it gained meanwhile. The rest is the same room as before, so neither every
   * picture and sound held nor what the store was found to lack is asked about again.
   */
  catchUpAfterResume(): void {
    if (Network.transport !== 'server' || !Network.peerContext.isRoom) return;
    const role = Network.serverRole;
    if (role === 'gm' || role === 'pl') {
      this.imageStorage.uploadMissedToAssetStore();
      this.audioStorage.uploadMissedToAssetStore();
      this.modelStorage.uploadMissedToAssetStore();
    }
    this.fetchList(Network.peerId);
  }

  /**
   * Fetches what the room server's room holds that this seat lacks: the pictures and sounds left in
   * a room everybody had gone from, which no member's catalog names any more. Each room starts with
   * a clean slate of what the store was found to lack. A list the server could not give just then is
   * asked for again a few times, while the seat is still in the room. What the list holds that the
   * room removed is taken out of the store again, when this seat may remove it.
   */
  fetchRoomAssets(): void {
    this.listRetries.clear();
    if (Network.transport !== 'server' || !Network.peerContext.isRoom) return;
    this.imageSharingSystem.forgetMisses();
    this.audioSharingSystem.forgetMisses();
    this.modelSharingSystem.forgetMisses();
    this.fetchList(Network.peerId);
  }

  /**
   * Reads the room's list again a little after somebody left, who may still be putting up what it
   * added and can name it to nobody once it is there. One reading waits at a time.
   */
  relistAfterLeave(): void {
    if (Network.transport !== 'server' || !Network.peerContext.isRoom || this.relistTimer) return;
    const peerId = Network.peerId;
    this.relistTimer = setTimeout(() => {
      this.relistTimer = null;
      if (Network.peerId === peerId && Network.peerContext.isRoom) this.fetchList(peerId);
    }, ROOM_ASSET_RELIST_MS);
  }

  /** Sends up what waited while the room server's operator had uploads stopped. */
  resumePaused(): void {
    this.imageStorage.resumePaused();
    this.audioStorage.resumePaused();
    this.modelStorage.resumePaused();
  }

  /**
   * How many turns this seat waits to put up a picture or sound a guest named, which every GM and PL
   * in the room received at once: one for each linked GM or PL whose peer id comes before this
   * seat's, so that the first has put it up before the next finds the store lacking it.
   */
  private turnToPutUpReceived(): number {
    const mine = Network.peerId;
    const ahead = PeerCursor.linkedCursors().filter(
      (cursor) => cursor !== PeerCursor.myCursor && canRoleEdit(cursor.role) && cursor.peerId < mine
    );
    return ahead.length;
  }

  private fetchList(peerId: string): void {
    void this.assetHttpStore.listRoomAssets().then((assets) => {
      if (Network.peerId !== peerId || !Network.peerContext.isRoom) return;
      if (!assets) {
        this.listRetries.schedule('list', () => this.fetchList(peerId));
        return;
      }
      this.listRetries.forget('list');
      const pictures = assets.filter((asset) => asset.type.startsWith('image/'));
      const sounds = assets.filter((asset) => asset.type.startsWith('audio/'));
      const models = assets.filter((asset) => asset.type === MODEL_TYPE);
      this.imageStorage.forgetUploaded(pictures.map((asset) => asset.id));
      this.audioStorage.forgetUploaded(sounds.map((asset) => asset.id));
      this.modelStorage.forgetUploaded(models.map((asset) => asset.id));
      this.assetRemoval.takeOut(assets.map((asset) => asset.id));
      this.imageSharingSystem.fetchListed(pictures);
      this.audioSharingSystem.fetchListed(sounds);
      this.modelSharingSystem.fetchListed(models);
    });
  }
}
