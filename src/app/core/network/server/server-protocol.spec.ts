import { PeerContext } from '@axe/core/network/peer-context';
import errors from '@axe/core/network/server/contract/errors.json';
import events from '@axe/core/network/server/contract/events.json';
import http from '@axe/core/network/server/contract/http.json';
import limits from '@axe/core/network/server/contract/limits.json';
import lww from '@axe/core/network/server/contract/lww.json';
import messages from '@axe/core/network/server/contract/messages.json';
import source from '@axe/core/network/server/contract/source.json';
import * as protocol from '@axe/core/network/server/server-protocol';
import {
  ACCOUNT_USER_ID_PREFIX,
  activeMessage,
  assetTokenRequest,
  authMessage,
  AUTHORITY_ONLY_EVENTS,
  AUTHORITY_PEER_ID,
  AuthorityEvent,
  ERROR_CODES,
  helloMessage,
  inviteRequest,
  isRollRejectReason,
  PROTOCOL_VERSION,
  readAssetUploadPolicy,
  readRoom,
  readRoomAssetList,
  readRoomList,
  readServerMessage,
  readUploadTicket,
  RETRYABLE_ERROR_CODES,
  ROLE_REJECT_REASONS,
  ROLL_REJECT_REASONS,
} from '@axe/core/network/server/server-protocol';
import { isNewerVersion } from '@axe/core/sync/object-version';
import * as MessagePack from '@axe/core/util/message-pack';

describe('the room server protocol, held to the server’s fixtures', () => {
  it.each(['hello', 'helloWithPassword', 'helloLoggedIn'] as const)(
    'makes the peer id of %s from its user id as the server checks it',
    async (name) => {
      const { peerId, userId } = messages.client[name];

      const made = await PeerContext.createRoom(userId, 'XyZ', 'any room', '');

      expect(made.peerId.slice(0, 6)).toBe(peerId.slice(0, 6));
    }
  );

  it('speaks the version of the contract it was copied from', () => {
    expect(PROTOCOL_VERSION).toBe(source.protocolVersion);
  });

  it('knows the events only the server sends, and every reason it refuses with', () => {
    expect([...AUTHORITY_ONLY_EVENTS]).toEqual(events.authorityOnly);
    expect([...ROLE_REJECT_REASONS]).toEqual(events.roleRejectReasons);
    expect([...ROLL_REJECT_REASONS]).toEqual(events.rollRejectReasons);
    expect(isRollRejectReason(events.rollRejected.reason)).toBe(true);
    expect(isRollRejectReason('lost')).toBe(false);
  });

  it('keeps the limits the server keeps', () => {
    const kept = protocol as unknown as Record<string, unknown>;
    for (const [name, value] of Object.entries(limits).filter(([key]) => key !== 'description')) {
      expect([name, kept[name]]).toEqual([name, value]);
    }
  });

  it('reads the room list and the asset list as the server answers them', () => {
    expect(readRoomList(http.roomList)).toEqual(http.roomList.rooms);
    expect(readRoom(http.room)).toEqual(http.room.room);
    expect(readRoom({ room: { ...http.room.room, members: '2' } })).toBeNull();
    expect(readRoom(http.roomList)).toBeNull();
    expect(readRoomAssetList(http.roomAssetList)).toEqual(http.roomAssetList.assets);
    expect(readRoomAssetList({ assets: [{ ...http.roomAssetList.assets[0], size: '1' }] })).toBeNull();
    expect(readRoomAssetList({ rooms: [] })).toBeNull();
    expect(readRoomAssetList(null)).toBeNull();
  });

  it('reads how a server with a limit on its requests takes big pictures and sounds, and the ticket for one', () => {
    const { upload } = http.uploadTicket;

    expect(readServerMessage(messages.server.welcomeWithUpload)).toEqual(messages.server.welcomeWithUpload);
    expect(readAssetUploadPolicy(messages.server.welcomeWithUpload.assetUpload)).toEqual({
      maxPutBytes: 4_000_000,
      directUpload: true,
    });
    expect(readAssetUploadPolicy(undefined)).toBeNull();
    expect(readAssetUploadPolicy({ maxPutBytes: '4', directUpload: true })).toBeNull();
    expect(readUploadTicket(http.uploadTicket)).toEqual(http.uploadTicket);
    expect(readUploadTicket({ ...http.uploadTicket, upload: { ...upload, method: 'POST' } })).toBeNull();
    expect(readUploadTicket({ ...http.uploadTicket, upload: { ...upload, headers: { a: 1 } } })).toBeNull();
    expect(readUploadTicket({ ...http.uploadTicket, upload: { ...upload, expiresAt: '1' } })).toBeNull();
    expect(readUploadTicket({ ticket: 'x' })).toBeNull();
    expect(readUploadTicket(null)).toBeNull();
  });

  it('knows every reason the server closes for, and which of them are worth retrying', () => {
    expect([...ERROR_CODES].sort()).toEqual(errors.errors.map((error) => error.code).sort());
    expect([...RETRYABLE_ERROR_CODES].sort()).toEqual(
      errors.errors
        .filter((error) => error.retry)
        .map((error) => error.code)
        .sort()
    );
  });

  it('reads every error the server sends', () => {
    for (const error of errors.errors) {
      expect(readServerMessage(error.message)).toEqual(error.message);
    }
  });

  it('says hello as the server expects: plain, with a password, and logged in with an invitation', () => {
    const { hello, helloWithPassword, helloLoggedIn } = messages.client;

    expect(helloMessage(hello.peerId, hello.userId)).toEqual(hello);
    expect(
      helloMessage(helloWithPassword.peerId, helloWithPassword.userId, { password: helloWithPassword.password })
    ).toEqual(helloWithPassword);
    expect(
      helloMessage(helloLoggedIn.peerId, helloLoggedIn.userId, {
        accessToken: helloLoggedIn.accessToken,
        invite: helloLoggedIn.invite,
      })
    ).toEqual(helloLoggedIn);
  });

  it('says how long the page went unused, and that it was used, as the server expects', () => {
    const { helloLeftAlone, active } = messages.client;

    expect(helloMessage(helloLeftAlone.peerId, helloLeftAlone.userId, { idleMs: helloLeftAlone.idleMs })).toEqual(
      helloLeftAlone
    );
    expect(helloMessage('p', 'u', { idleMs: -5 }).idleMs).toBe(0);
    expect(activeMessage()).toEqual(active);
  });

  it('leaves out of a hello whatever is empty', () => {
    expect(helloMessage('p', 'u', { password: '', accessToken: '', invite: '' })).toEqual({
      type: 'hello',
      protocolVersion: PROTOCOL_VERSION,
      peerId: 'p',
      userId: 'u',
    });
  });

  it('asks for an invitation as the server expects', () => {
    expect(inviteRequest(messages.client.inviteRequest.role as 'pl')).toEqual(messages.client.inviteRequest);
  });

  it('hands over a fresh access token as the server expects', () => {
    expect(authMessage(messages.client.auth.accessToken)).toEqual(messages.client.auth);
  });

  it('asks for a fresh asset token as the server expects', () => {
    expect(assetTokenRequest()).toEqual(messages.client.assetToken);
  });

  it('reads no welcome without the asset token, and no asset token without its end', () => {
    const { assetToken: _token, ...welcome } = messages.server.welcome;
    const { expiresAt: _end, ...assetToken } = messages.server.assetToken;

    expect(readServerMessage(welcome)).toBeNull();
    expect(readServerMessage(assetToken)).toBeNull();
  });

  it('knows how the user id of somebody logged in begins', () => {
    expect(messages.client.helloLoggedIn.userId.startsWith(ACCOUNT_USER_ID_PREFIX)).toBe(true);
    expect(messages.server.join.member.userId.startsWith(ACCOUNT_USER_ID_PREFIX)).toBe(true);
  });

  it('names the events with the server as the server does', () => {
    expect(messages.client.roleRequest.events[0].eventName).toBe(AuthorityEvent.ROLE_REQUEST);
    expect(messages.server.authoritative.events[0].eventName).toBe(AuthorityEvent.AUTHORITATIVE);
    expect(messages.server.withdraw.events[0].eventName).toBe(AuthorityEvent.WITHDRAW);
  });

  it('reads every message the server sends, after a round trip through MessagePack', () => {
    for (const message of Object.values(messages.server)) {
      expect(readServerMessage(MessagePack.decode(MessagePack.encode(message)))).toEqual(message);
    }
  });

  it('names the authority as the server does', () => {
    expect(messages.server.welcome.authorityPeerId).toBe(AUTHORITY_PEER_ID);
  });

  it('turns away shapes no server message has', () => {
    const { welcome, join, invite } = messages.server;
    for (const value of [
      null,
      'hello',
      [],
      { type: 'bogus' },
      { type: 'leave' },
      { type: 'data', from: 'x' },
      { ...welcome, role: 'owner' },
      { ...join, member: { ...join.member, role: undefined } },
      { ...invite, role: 'owner' },
      { ...invite, invite: 1 },
    ]) {
      expect(readServerMessage(value)).toBeNull();
    }
  });

  it('reads a room list and turns away anything else', () => {
    const rooms = [{ roomKey: 'k'.repeat(32), roomId: 'Ab3', name: '卓', hasPassword: false, members: 2 }];

    expect(readRoomList({ rooms })).toEqual(rooms);
    expect(readRoomList({ rooms: [{ roomKey: 1 }] })).toBeNull();
    expect(readRoomList(null)).toBeNull();
  });

  it('reads the mark on a room its reader may delete, and turns away a mark that is not true or false', () => {
    const room = { roomKey: 'k'.repeat(32), roomId: 'Ab3', name: '卓', hasPassword: false, members: 2 };

    expect(readRoomList({ rooms: [{ ...room, deletable: true }] })).toEqual([{ ...room, deletable: true }]);
    expect(readRoomList({ rooms: [{ ...room, deletable: 'yes' }] })).toBeNull();
  });

  it('decides which copy of an object wins as the server does', () => {
    for (const testCase of lww.cases) {
      if (testCase.deleted) continue;
      const stored = testCase.stored;
      const accepted = stored === null || isNewerVersion(testCase.incoming, stored.majorVersion + stored.minorVersion);

      expect(accepted, testCase.name).toBe(testCase.verdict === 'accept');
    }
  });
});
