import errors from '@axe/core/network/server/contract/errors.json';
import lww from '@axe/core/network/server/contract/lww.json';
import messages from '@axe/core/network/server/contract/messages.json';
import source from '@axe/core/network/server/contract/source.json';
import {
  AUTHORITY_PEER_ID,
  ERROR_CODES,
  helloMessage,
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

  it('says hello as the server expects, with and without a password', () => {
    const { hello, helloWithPassword } = messages.client;

    expect(helloMessage(hello.peerId, hello.userId)).toEqual(hello);
    expect(helloMessage(helloWithPassword.peerId, helloWithPassword.userId, helloWithPassword.password)).toEqual(
      helloWithPassword
    );
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
    for (const value of [null, 'hello', [], { type: 'bogus' }, { type: 'leave' }, { type: 'data', from: 'x' }]) {
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
