import errors from '@axe/core/network/server/contract/errors.json';
import lww from '@axe/core/network/server/contract/lww.json';
import messages from '@axe/core/network/server/contract/messages.json';
import source from '@axe/core/network/server/contract/source.json';
import {
  ACCOUNT_USER_ID_PREFIX,
  authMessage,
  AUTHORITY_PEER_ID,
  AuthorityEvent,
  ERROR_CODES,
  helloMessage,
  inviteRequest,
  PROTOCOL_VERSION,
  readRoomList,
  readServerMessage,
  RETRYABLE_ERROR_CODES,
} from '@axe/core/network/server/server-protocol';
import { isNewerVersion } from '@axe/core/sync/object-version';
import * as MessagePack from '@axe/core/util/message-pack';

describe('the room server protocol, held to the server’s fixtures', () => {
  it('speaks the version of the contract it was copied from', () => {
    expect(PROTOCOL_VERSION).toBe(source.protocolVersion);
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

  it('decides which copy of an object wins as the server does', () => {
    for (const testCase of lww.cases) {
      if (testCase.deleted) continue;
      const stored = testCase.stored;
      const accepted = stored === null || isNewerVersion(testCase.incoming, stored.majorVersion + stored.minorVersion);

      expect(accepted, testCase.name).toBe(testCase.verdict === 'accept');
    }
  });
});
