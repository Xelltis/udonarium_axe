import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ServerAuthService } from '@axe/application/lobby/server-auth.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { LocalModePreferenceService } from '@axe/application/ui/local-mode-preference.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { OverlayModeService } from '@axe/application/ui/overlay-mode.service';
import { ViewportService } from '@axe/application/ui/viewport.service';
import { Network } from '@axe/core/index';
import { PeerContext } from '@axe/core/network/peer-context';
import { isBanned, ServerRoomApiError } from '@axe/core/network/server/server-room-api';
import { InviteLinkParams, parseInviteLink } from '@axe/domain/peer/invite-link';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { dropInvitationFromAddress } from '@axe/features/lobby/leave-room';
import { NetworkReachService } from '@axe/features/lobby/network-reach.service';
import { OperatorContactComponent } from '@axe/features/lobby/operator-contact/operator-contact.component';
import {
  PasswordCheckComponent,
  type PasswordCheckOptions,
} from '@axe/features/lobby/password-check/password-check.component';
import { isInAnotherRoom, RoomJoinService, wasLastIn } from '@axe/features/lobby/room-join.service';
import { WithheldEntryService } from '@axe/features/lobby/withheld-entry';
import { RoomRestoreOfferService } from '@axe/features/room-archive/room-restore-banner/room-restore-offer.service';
import { TranslocoModule } from '@jsverse/transloco';

type InviteJoinState = 'idle' | 'joining' | 'askLogin' | 'offline' | 'notFound' | 'failed' | 'banned' | 'done';

/** Where a tab keeps the rooms its reader chose to watch rather than log in for, so a reload does not ask again. */
const WATCHED_WITHOUT_LOGIN_KEY = 'udonarium-axe.watched-without-login';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-invite-join',
  templateUrl: './invite-join.component.html',
  imports: [OperatorContactComponent, TranslocoModule],
})
export class InviteJoinComponent {
  private readonly t = inject(TRANSLATE_FN);
  private readonly roomJoin = inject(RoomJoinService);
  private readonly modalService = inject(ModalService);
  private readonly overlayMode = inject(OverlayModeService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly localModePreference = inject(LocalModePreferenceService);
  private readonly isCompact = inject(ViewportService).isCompact;
  private readonly restoreOffer = inject(RoomRestoreOfferService);
  private readonly reach = inject(NetworkReachService);
  private readonly withheldEntry = inject(WithheldEntryService);
  private readonly auth = inject(ServerAuthService);

  private readonly state = signal<InviteJoinState>('idle');
  private readonly roomName = signal('');
  /** The operator's contact looking the room up was refused with; null for none. */
  private readonly refusalContact = signal<string | null>(null);
  /** Lets the join go on once the reader asked to log in has done so or chosen to watch. */
  private answerLogin: (() => void) | null = null;
  /** The key of the room the reader is being asked about. */
  private askedRoomKey = '';

  protected readonly isJoining = computed(() => this.state() === 'joining');
  /** Whether the reader is being asked to log in before going in, or to go in to watch. */
  protected readonly isAskingLogin = computed(() => this.state() === 'askLogin');
  protected readonly isLoggingIn = this.auth.isLoggingIn;
  /** The operator's contact to show beside the word that the operator blocked this connection. */
  protected readonly bannedContact = computed(() => (this.state() === 'banned' ? this.refusalContact() : null));
  /** Whether this browser is set to play offline, where no room can be joined until it goes online. */
  protected readonly isOffline = computed(() => this.state() === 'offline');
  /**
   * Whether the notice is up. It is left off a screen meant for streaming, where an unpressable
   * panel would sit in the broadcast. On a narrow screen, the notice that a browser set to play
   * offline joins nothing waits for the offer to restore the last table to be answered, which takes
   * the top of the screen there.
   */
  protected readonly visible = computed(
    () =>
      !this.overlayMode.active() &&
      this.state() !== 'idle' &&
      this.state() !== 'done' &&
      !(this.isOffline() && this.isCompact() && this.restoreOffer.visible())
  );

  protected readonly message = computed(() => {
    switch (this.state()) {
      case 'joining':
        return this.roomJoin.waitingForPreviousConnection()
          ? this.t('feature.lobby.waitingForPreviousConnection')
          : this.t('feature.lobby.invite.joining', { roomName: this.roomName() });
      case 'askLogin':
        return this.t('feature.lobby.invite.askLogin', { roomName: this.roomName() });
      case 'offline':
        return this.t('feature.lobby.invite.offline', { roomName: this.roomName() });
      case 'notFound':
        return this.t('feature.lobby.invite.notFound', { roomName: this.roomName() });
      case 'failed':
        return this.t('feature.lobby.invite.failed', { roomName: this.roomName() });
      case 'banned':
        return this.t('feature.lobby.invite.banned', { roomName: this.roomName() });
      default:
        return '';
    }
  });

  constructor() {
    const params = parseInviteLink(location.hash);
    if (!params) return;
    this.objectChange.networkOpen$.subscribe(() => {
      if (isInAnotherRoom(params.roomId)) dropInvitationFromAddress();
    }, this.destroyRef);

    this.roomName.set(params.roomName);
    if (this.localModePreference.enabled()) {
      this.state.set('offline');
      return;
    }
    this.state.set('joining');
    effect(() => {
      if (this.reach.unreachable() && untracked(this.state) === 'joining') this.state.set('failed');
    });
    effect(() => {
      if (this.auth.account() && untracked(this.state) === 'askLogin') this.answerLogin?.();
    });

    if (Network.isOpen) {
      void this.joinOrSayFailed(params);
      return;
    }
    const offOpen = this.objectChange.networkOpen$.subscribe(() => {
      offOpen();
      if (this.state() === 'joining' && !this.movedOn(params)) void this.joinOrSayFailed(params);
    }, this.destroyRef);
  }

  /**
   * Opens the lobby, to find the room another way. It is fetched only now, as a link that works
   * never needs it.
   */
  protected showLobby(): void {
    this.state.set('done');
    void this.modalService.openLazy(
      () => import('@axe/features/lobby/lobby/lobby.component').then((loaded) => loaded.LobbyComponent),
      { title: this.t('feature.lobby.lobby.title'), width: 700, height: 400, left: 0, top: 400 }
    );
  }

  protected dismiss(): void {
    this.state.set('done');
  }

  /** Opens the login; once it is done the join goes on as the account. */
  protected logIn(): void {
    void this.auth.startLogin();
  }

  /** Goes in without logging in, to watch, which this tab then remembers for the room. */
  protected watch(): void {
    const roomKey = this.askedRoomKey;
    try {
      const watched = readWatchedWithoutLogin();
      if (!watched.includes(roomKey))
        sessionStorage.setItem(WATCHED_WITHOUT_LOGIN_KEY, JSON.stringify([...watched, roomKey]));
    } catch {
      // a tab that keeps nothing asks again on a reload
    }
    this.answerLogin?.();
  }

  /**
   * Waits, where a room server offers a login the reader has not made, for them to log in or to
   * choose to watch. A link opened as on any other table would otherwise take them in as a guest
   * without a word, and the login is in the lobby, which a link never opens. A screen for streaming,
   * which always watches, and a tab that chose to watch the room before are not asked; nor is a
   * reader where the server is not known to offer a login, once it has been asked.
   */
  private async logInOrWatch(roomKey: string): Promise<void> {
    if (!this.auth.isConfigured || this.auth.account()) return;
    if (this.overlayMode.active() || readWatchedWithoutLogin().includes(roomKey)) return;
    if (this.auth.offersLogin() === null) await this.auth.refreshProviders();
    if (this.auth.offersLogin() !== true || this.auth.account()) return;
    this.askedRoomKey = roomKey;
    this.state.set('askLogin');
    await new Promise<void>((resolve) => (this.answerLogin = resolve));
    this.answerLogin = null;
    this.state.set('joining');
  }

  /**
   * Joins as the link says, and says it could not when looking the room up failed, as when the
   * server cannot be reached or its operator has blocked this connection, rather than leaving the
   * banner saying it is joining.
   */
  private async joinOrSayFailed(params: InviteLinkParams): Promise<void> {
    try {
      await this.join(params);
    } catch (reason) {
      this.refusalContact.set(reason instanceof ServerRoomApiError ? reason.contact : null);
      this.state.set(isBanned(reason) ? 'banned' : 'failed');
    }
  }

  /**
   * Whether the seat has been sent into another room while the invitation waited, as one it made
   * from the lobby, which the invitation then leaves it in: the banner goes, nothing is joined, and
   * the invitation leaves the address, which would take the page reloaded to the invited room. Any
   * room but the invited one opening later takes it off the address too.
   */
  private movedOn(params: InviteLinkParams): boolean {
    if (!isInAnotherRoom(params.roomId)) return false;
    this.state.set('done');
    dropInvitationFromAddress();
    return true;
  }

  /**
   * Joins the room the link names, in the role the link names, taken before the room is opened, so
   * that the room never sees the seat in another and a reload while it waits comes back in it. A seat
   * coming back to the room this tab was last in, as a reload brings it back, takes up the role it
   * held there instead, which may have been given since the link was. A join that comes to nothing
   * leaves the seat in the role it had, unless it has gone into another room meanwhile, as one it
   * made, where its role is that room's.
   */
  private async join(params: InviteLinkParams): Promise<void> {
    if (Network.transport === 'server') {
      await this.joinThroughServer(params);
      return;
    }
    const room = await this.roomJoin.findRoom(params.roomId);
    if (this.movedOn(params)) return;
    const peerContexts = (room?.peers ?? []) as PeerContext[];
    if (!room || peerContexts.length < 1) {
      this.state.set('notFound');
      return;
    }

    if (!(await this.withheldEntry.mayEnter(null))) {
      this.state.set('failed');
      return;
    }
    const password = await this.resolvePassword(room.hasPassword, params.password, peerContexts[0]);
    if (this.movedOn(params)) return;
    if (password === null || !(await peerContexts[0].verifyPassword(password))) {
      this.state.set('failed');
      return;
    }

    PeerCursor.myCursor.reConnectPass = password;
    const roleBefore = PeerCursor.myCursor.role;
    if (!wasLastIn(params.roomId)) this.applyRole(params.role);
    const isJoined = await this.roomJoin.join(peerContexts, password);
    if (!isJoined) {
      if (!isInAnotherRoom(params.roomId)) this.applyRole(roleBefore);
      this.state.set('failed');
      return;
    }

    this.state.set('done');
  }

  /**
   * Joins the invited room on a room server, found by the key in the link or, for a link from
   * before keys, by its id and name. The server checks the password as the room is joined.
   */
  private async joinThroughServer(params: InviteLinkParams): Promise<void> {
    const room = await this.roomJoin.findServerRoom(params.roomKey, params.roomId, params.roomName);
    if (this.movedOn(params)) return;
    if (!room) {
      this.state.set('notFound');
      return;
    }

    if (!(await this.withheldEntry.mayEnter(room.roomKey ?? null))) {
      this.state.set('failed');
      return;
    }
    await this.logInOrWatch(room.roomKey || `${room.id}/${room.name}`);
    if (this.movedOn(params)) return;
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
    if (this.movedOn(params)) return;

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

/** The rooms this tab's reader chose to watch rather than log in for, by key. */
function readWatchedWithoutLogin(): string[] {
  try {
    const read: unknown = JSON.parse(sessionStorage.getItem(WATCHED_WITHOUT_LOGIN_KEY) ?? '[]');
    return Array.isArray(read) ? read.filter((key): key is string => typeof key === 'string') : [];
  } catch {
    return [];
  }
}
