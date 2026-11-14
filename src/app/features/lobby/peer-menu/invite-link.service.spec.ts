import { TestBed } from '@angular/core/testing';
import { Network } from '@axe/core/network/network';
import { IPeerContext } from '@axe/core/network/peer-context';
import { parseInviteLink } from '@axe/domain/peer/invite-link';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { InviteLinkService } from '@axe/features/lobby/peer-menu/invite-link.service';

describe('InviteLinkService', () => {
  const DAY_MS = 24 * 60 * 60 * 1000;

  let invites: InviteLinkService;
  let requestInvite: ReturnType<typeof vi.spyOn>;
  let roomKey: string;

  function answerWith(expiresIn: number): void {
    requestInvite.mockImplementation(async (role: PeerRole) => ({
      invite: `signed-${role}`,
      expiresAt: Date.now() + expiresIn,
    }));
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [InviteLinkService] });
    invites = TestBed.inject(InviteLinkService);
    roomKey = 'key-1';
    vi.spyOn(Network.instance, 'roomKey', 'get').mockImplementation(() => roomKey);
    vi.spyOn(Network.instance, 'peerContext', 'get').mockReturnValue({
      isRoom: true,
      roomId: 'a1b',
      roomName: '卓',
      password: 'secret',
    } as IPeerContext);
    requestInvite = vi.spyOn(Network.instance, 'requestInvite');
    answerWith(7 * DAY_MS);
  });

  afterEach(() => vi.restoreAllMocks());

  it('holds the invitation the room server signed, one for each role', async () => {
    expect(invites.held(PeerRole.Player)).toBeNull();

    await invites.request(PeerRole.Player);

    expect(invites.held(PeerRole.Player)?.invite).toBe(`signed-${PeerRole.Player}`);
    expect(invites.held(PeerRole.Guest)).toBeNull();
    expect(invites.failed()).toBe(false);
  });

  it('holds an invitation for the room it was signed for alone', async () => {
    await invites.request(PeerRole.Player);

    roomKey = 'key-2';

    expect(invites.held(PeerRole.Player)).toBeNull();
  });

  it('does not ask again while an invitation has more than a day to run', async () => {
    await invites.request(PeerRole.Player);
    await invites.request(PeerRole.Player);

    expect(requestInvite).toHaveBeenCalledOnce();
  });

  it('asks afresh for an invitation with under a day to run', async () => {
    answerWith(DAY_MS - 1000);
    await invites.request(PeerRole.Player);
    await invites.request(PeerRole.Player);

    expect(requestInvite).toHaveBeenCalledTimes(2);
  });

  it('does not send a second request while one is on its way', async () => {
    const both = [invites.request(PeerRole.Player), invites.request(PeerRole.Player)];
    await Promise.all(both);

    expect(requestInvite).toHaveBeenCalledOnce();
  });

  it('says so when the room server signs nothing or does not answer, until told to forget it', async () => {
    requestInvite.mockResolvedValue({ invite: '', expiresAt: null });
    await invites.request(PeerRole.Player);
    expect(invites.failed()).toBe(true);
    expect(invites.held(PeerRole.Player)).toBeNull();

    invites.forgetFailure();
    expect(invites.failed()).toBe(false);

    requestInvite.mockRejectedValue(new Error('no answer'));
    await invites.request(PeerRole.Player);
    expect(invites.failed()).toBe(true);

    answerWith(7 * DAY_MS);
    await invites.request(PeerRole.Player);
    expect(invites.failed()).toBe(false);
  });

  it('puts every invitation away', async () => {
    await invites.request(PeerRole.Player);

    invites.putAway();

    expect(invites.held(PeerRole.Player)).toBeNull();
  });

  it('writes the link into the room as chosen, with the password only when asked', () => {
    const link = invites.link({ includePassword: true, role: PeerRole.Guest, overlay: false, invite: '' });
    const bare = invites.link({ includePassword: false, role: null, overlay: false, invite: 'signed' });

    const parsed = parseInviteLink(new URL(link).hash)!;
    expect(parsed.roomId).toBe('a1b');
    expect(parsed.roomName).toBe('卓');
    expect(parsed.password).toBe('secret');
    expect(parsed.role).toBe(PeerRole.Guest);
    expect(parseInviteLink(new URL(bare).hash)!.password).toBe('');
    expect(bare).toContain('i=signed');
    expect(bare).not.toContain('role=');
  });

  it('writes no link outside a room', () => {
    vi.spyOn(Network.instance, 'peerContext', 'get').mockReturnValue({ isRoom: false } as IPeerContext);

    expect(invites.link({ includePassword: true, role: PeerRole.Player, overlay: false, invite: '' })).toBe('');
  });
});
