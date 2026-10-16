import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { RoomJoinService, wasLastIn } from '@axe/application/lobby/room-join.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { LocalModePreferenceService } from '@axe/application/ui/local-mode-preference.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { OverlayModeService } from '@axe/application/ui/overlay-mode.service';
import { Network } from '@axe/core/index';
import { PeerContext } from '@axe/core/network/peer-context';
import { InviteLinkParams, parseInviteLink } from '@axe/domain/peer/invite-link';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { LobbyComponent } from '@axe/features/lobby/lobby/lobby.component';
import {
  PasswordCheckComponent,
  type PasswordCheckOptions,
} from '@axe/features/lobby/password-check/password-check.component';
import { TranslocoModule } from '@jsverse/transloco';

type InviteJoinState = 'idle' | 'joining' | 'offline' | 'notFound' | 'failed' | 'done';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-invite-join',
  templateUrl: './invite-join.component.html',
  imports: [TranslocoModule],
})
export class InviteJoinComponent {
  private readonly t = inject(TRANSLATE_FN);
  private readonly roomJoin = inject(RoomJoinService);
  private readonly modalService = inject(ModalService);
  private readonly overlayMode = inject(OverlayModeService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly localModePreference = inject(LocalModePreferenceService);

  private readonly state = signal<InviteJoinState>('idle');
  private readonly roomName = signal('');

  protected readonly isJoining = computed(() => this.state() === 'joining');
  /** Whether this browser is set to play offline, where no room can be joined until it goes online. */
  protected readonly isOffline = computed(() => this.state() === 'offline');
  // It is left off a screen meant for streaming, where an unpressable panel would sit in the broadcast.
  protected readonly visible = computed(
    () => !this.overlayMode.active() && this.state() !== 'idle' && this.state() !== 'done'
  );

  protected readonly message = computed(() => {
    switch (this.state()) {
      case 'joining':
        return this.roomJoin.waitingForPreviousConnection()
          ? this.t('feature.lobby.waitingForPreviousConnection')
          : this.t('feature.lobby.invite.joining', { roomName: this.roomName() });
      case 'offline':
        return this.t('feature.lobby.invite.offline', { roomName: this.roomName() });
      case 'notFound':
        return this.t('feature.lobby.invite.notFound', { roomName: this.roomName() });
      case 'failed':
        return this.t('feature.lobby.invite.failed', { roomName: this.roomName() });
      default:
        return '';
    }
  });

  constructor() {
    const params = parseInviteLink(location.hash);
    if (!params) return;

    this.roomName.set(params.roomName);
    if (this.localModePreference.enabled()) {
      this.state.set('offline');
      return;
    }
    this.state.set('joining');

    if (Network.isOpen) {
      void this.joinOrSayFailed(params);
      return;
    }
    const offOpen = this.objectChange.networkOpen$.subscribe(() => {
      offOpen();
      void this.joinOrSayFailed(params);
    }, this.destroyRef);
  }

  protected showLobby(): void {
    this.state.set('done');
    this.modalService.open(LobbyComponent, {
      title: this.t('feature.lobby.lobby.title'),
      width: 700,
      height: 400,
      left: 0,
      top: 400,
    });
  }

  protected dismiss(): void {
    this.state.set('done');
  }

  /**
   * Joins as the link says, and says it could not when looking the room up failed, as when the
   * server cannot be reached, rather than leaving the banner saying it is joining.
   */
  private async joinOrSayFailed(params: InviteLinkParams): Promise<void> {
    try {
      await this.join(params);
    } catch {
      this.state.set('failed');
    }
  }

  /**
   * Joins the room the link names, in the role the link names. A seat coming back to the room this
   * tab was last in, as a reload brings it back, takes up the role it held there instead, which may
   * have been given since the link was.
   */
  private async join(params: InviteLinkParams): Promise<void> {
    if (Network.transport === 'server') {
      await this.joinThroughServer(params);
      return;
    }
    const room = await this.roomJoin.findRoom(params.roomId);
    const peerContexts = (room?.peers ?? []) as PeerContext[];
    if (!room || peerContexts.length < 1) {
      this.state.set('notFound');
      return;
    }

    const password = await this.resolvePassword(room.hasPassword, params.password, peerContexts[0]);
    if (password === null || !(await peerContexts[0].verifyPassword(password))) {
      this.state.set('failed');
      return;
    }

    PeerCursor.myCursor.reConnectPass = password;
    const isComingBack = wasLastIn(params.roomId);
    const isJoined = await this.roomJoin.join(peerContexts, password);
    if (!isJoined) {
      this.state.set('failed');
      return;
    }

    if (!isComingBack) this.applyRole(params.role);
    this.state.set('done');
  }

  /**
   * Joins the invited room on a room server, found by the key in the link or, for a link from
   * before keys, by its id and name. The server checks the password as the room is joined.
   */
  private async joinThroughServer(params: InviteLinkParams): Promise<void> {
    const room = await this.roomJoin.findServerRoom(params.roomKey, params.roomId, params.roomName);
    if (!room) {
      this.state.set('notFound');
      return;
    }

    let password = params.password;
    if (room.hasPassword && password.length < 1) {
      const options: PasswordCheckOptions = { checkedByServer: true, title: `${room.name}/${room.id}` };
      const typed = await this.modalService.open<string>(PasswordCheckComponent, options);
      if (typed == null) {
        this.state.set('failed');
        return;
      }
      password = typed;
    }

    PeerCursor.myCursor.reConnectPass = password;
    if (params.invite) Network.setServerInvite(params.invite, room.roomKey ?? '');
    if (!(await this.roomJoin.joinServerRoom(room, password))) {
      this.state.set('failed');
      return;
    }

    this.state.set('done');
  }

  private async resolvePassword(hasPassword: boolean, given: string, peerContext: PeerContext): Promise<string | null> {
    if (!hasPassword || given.length > 0) return given;

    const options: PasswordCheckOptions = {
      peerContext,
      title: `${peerContext.roomName}/${peerContext.roomId}`,
    };
    return (await this.modalService.open<string>(PasswordCheckComponent, options)) ?? null;
  }

  private applyRole(role: PeerRole | null): void {
    if (!role) return;
    PeerCursor.myCursor.role = role;
    PeerCursor.myCursor.update();
  }
}
