import { signal, type WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RoomJoinService } from '@axe/application/lobby/room-join.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { Network } from '@axe/core/index';
import { PeerContext } from '@axe/core/network/peer-context';
import { IRoomInfo, RoomInfo } from '@axe/core/network/room-info';
import { buildInviteLink } from '@axe/domain/peer/invite-link';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { InviteJoinComponent } from '@axe/features/lobby/invite-join/invite-join.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

function createRoom(withPassword = false): IRoomInfo {
  const peer = PeerContext.parse('peer-1');
  peer.roomId = 'a1b';
  peer.roomName = 'room';
  if (withPassword) peer.password = 'pw';
  vi.spyOn(peer, 'verifyPassword').mockResolvedValue(true);
  return new RoomInfo('a1b', 'room', [peer]);
}

describe('InviteJoinComponent', () => {
  let fixture: ComponentFixture<InviteJoinComponent>;
  let findRoom: ReturnType<typeof vi.fn>;
  let join: ReturnType<typeof vi.fn>;
  let modalOpen: ReturnType<typeof vi.fn>;
  let waitingForPreviousConnection: WritableSignal<boolean>;
  let originalMyCursor: PeerCursor;

  async function setup(hash: string): Promise<void> {
    location.hash = hash;
    await TestBed.configureTestingModule({
      imports: [InviteJoinComponent],
      providers: [
        ...TEST_PROVIDERS,
        { provide: RoomJoinService, useValue: { findRoom, join, waitingForPreviousConnection } },
      ],
    }).compileComponents();
    TestBed.overrideProvider(ModalService, { useValue: { open: modalOpen } });
    fixture = TestBed.createComponent(InviteJoinComponent);
    fixture.detectChanges();
  }

  function bannerText(): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  async function eventually(assert: () => void): Promise<void> {
    await vi.waitFor(() => {
      fixture.detectChanges();
      assert();
    });
  }

  async function flush(): Promise<void> {
    for (let i = 0; i < 10; i++) await Promise.resolve();
    fixture.detectChanges();
  }

  beforeEach(() => {
    findRoom = vi.fn().mockResolvedValue(createRoom());
    join = vi.fn().mockResolvedValue(true);
    modalOpen = vi.fn().mockResolvedValue('');
    waitingForPreviousConnection = signal(false);
    originalMyCursor = PeerCursor.myCursor;
    PeerCursor.myCursor = { reConnectPass: '', role: PeerRole.Player, update: vi.fn() } as unknown as PeerCursor;
    vi.spyOn(Network, 'isOpen', 'get').mockReturnValue(true);
  });

  afterEach(() => {
    location.hash = '';
    PeerCursor.myCursor = originalMyCursor;
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('shows nothing and joins nothing without an invitation', async () => {
    await setup('');
    await flush();

    expect(bannerText().trim()).toBe('');
    expect(findRoom).not.toHaveBeenCalled();
  });

  it('finds the room and joins it from an invitation', async () => {
    await setup('#join?r=a1b&n=room');

    await eventually(() => expect(join).toHaveBeenCalledOnce());
    expect(findRoom).toHaveBeenCalledWith('a1b');
  });

  it('takes the banner away once it is in', async () => {
    await setup('#join?r=a1b&n=room');

    await eventually(() => expect(bannerText().trim()).toBe(''));
  });

  it('says it is waiting for this seat’s previous connection to drop while the join does', async () => {
    join.mockReturnValue(new Promise<boolean>(() => {}));
    await setup('#join?r=a1b&n=room');
    await eventually(() => expect(join).toHaveBeenCalled());

    waitingForPreviousConnection.set(true);
    fixture.detectChanges();
    expect(bannerText()).toContain('前の接続が切れるのを待っています');
  });

  it('takes the role the link names', async () => {
    await setup('#join?r=a1b&n=room&role=guest');

    await eventually(() => expect(PeerCursor.myCursor.role).toBe(PeerRole.Guest));
  });

  it('says so when the room is not there', async () => {
    findRoom.mockResolvedValue(null);
    await setup('#join?r=a1b&n=room');

    await eventually(() => expect(bannerText()).toContain('見つかりません'));
    expect(join).not.toHaveBeenCalled();
  });

  it('says so when it cannot get in', async () => {
    join.mockResolvedValue(false);
    await setup('#join?r=a1b&n=room');

    await eventually(() => expect(bannerText()).toContain('参加できません'));
  });

  it('asks for the password when the link carries none', async () => {
    findRoom.mockResolvedValue(createRoom(true));
    await setup('#join?r=a1b&n=room');

    await eventually(() => expect(modalOpen).toHaveBeenCalledOnce());
  });

  it('asks for nothing when it does', async () => {
    findRoom.mockResolvedValue(createRoom(true));
    await setup(buildInviteLink('', { roomId: 'a1b', roomName: 'room', password: 'pw', role: null, overlay: false }));

    await eventually(() => expect(join).toHaveBeenCalledWith(expect.anything(), 'pw'));
    expect(modalOpen).not.toHaveBeenCalled();
  });
});
