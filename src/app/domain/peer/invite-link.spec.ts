import {
  buildInviteLink,
  decodeInvitePassword,
  encodeInvitePassword,
  parseInviteLink,
} from '@axe/domain/peer/invite-link';
import { PeerRole } from '@axe/domain/peer/peer-role';

const BASE_URL = 'https://example.test/axe/';

describe('buildInviteLink', () => {
  it('carries the identifier and the name of the room', () => {
    const link = buildInviteLink(BASE_URL, {
      roomId: 'a1b',
      roomName: '深海の街',
      roomKey: '',
      password: '',
      role: null,
      overlay: false,
    });
    expect(link).toBe(`${BASE_URL}#join?r=a1b&n=${encodeURIComponent('深海の街')}`);
  });

  it('never carries the password in the open', () => {
    const link = buildInviteLink(BASE_URL, {
      roomId: 'a1b',
      roomName: 'room',
      roomKey: '',
      password: 'himitsu',
      role: null,
      overlay: false,
    });

    expect(link).not.toContain('himitsu');
    expect(link).toContain('p=');
  });

  it('carries a role where one is given', () => {
    const link = buildInviteLink(BASE_URL, {
      roomId: 'a1b',
      roomName: 'room',
      roomKey: '',
      password: '',
      role: PeerRole.Guest,
      overlay: false,
    });
    expect(link).toBe(`${BASE_URL}#join?r=a1b&n=room&role=guest`);
  });

  it('carries no empty password', () => {
    const link = buildInviteLink(BASE_URL, {
      roomId: 'a1b',
      roomName: 'room',
      roomKey: '',
      password: '',
      role: PeerRole.Player,
      overlay: false,
    });
    expect(link).toBe(`${BASE_URL}#join?r=a1b&n=room&role=pl`);
  });
});

describe('parseInviteLink', () => {
  it('makes the round trip', () => {
    const params = {
      roomId: 'a1b',
      roomName: '深海の街 #2',
      roomKey: '',
      password: 'p a s s',
      role: PeerRole.Player,
      overlay: false,
      invite: '',
    };
    const link = buildInviteLink(BASE_URL, params);
    expect(parseInviteLink(link.slice(link.indexOf('#')))).toEqual(params);
  });

  it('carries an invitation the room server signed', () => {
    const params = {
      roomId: 'a1b',
      roomName: 'room',
      roomKey: '0123456789abcdef0123456789abcdef',
      password: '',
      role: null,
      overlay: false,
      invite: 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiZ20ifQ.c2lnbmVk',
    };
    const link = buildInviteLink(BASE_URL, params);

    expect(link).toContain('i=');
    expect(parseInviteLink(link.slice(link.indexOf('#')))).toEqual(params);
  });

  it('makes it for a password of any characters', () => {
    const params = {
      roomId: 'xyz',
      roomName: 'room',
      roomKey: '',
      password: '合言葉＆記号<>"',
      role: null,
      overlay: false,
    };
    const link = buildInviteLink(BASE_URL, params);
    expect(parseInviteLink(link.slice(link.indexOf('#')))?.password).toBe(params.password);
  });

  it('falls back to the defaults without either', () => {
    expect(parseInviteLink('#join?r=a1b&n=room')).toEqual({
      roomId: 'a1b',
      roomName: 'room',
      roomKey: '',
      password: '',
      role: null,
      overlay: false,
      invite: '',
    });
  });

  it('ignores a role it does not know', () => {
    expect(parseInviteLink('#join?r=a1b&n=room&role=admin')?.role).toBeNull();
  });

  it('takes nothing but an invitation', () => {
    expect(parseInviteLink('')).toBeNull();
    expect(parseInviteLink('#')).toBeNull();
    expect(parseInviteLink('#other?r=a1b&n=room')).toBeNull();
  });

  it('takes none missing the identifier or the name of the room', () => {
    expect(parseInviteLink('#join?n=room')).toBeNull();
    expect(parseInviteLink('#join?r=a1b')).toBeNull();
    expect(parseInviteLink('#join?r=&n=room')).toBeNull();
  });

  it('reads a broken password as none', () => {
    expect(parseInviteLink('#join?r=a1b&n=room&p=!!!not-base64!!!')?.password).toBe('');
  });
});

describe('encodeInvitePassword / decodeInvitePassword', () => {
  it('leaves none of the original text behind', () => {
    expect(encodeInvitePassword('himitsu', 'a1broom')).not.toContain('himitsu');
  });

  it('comes back only under the same salt', () => {
    const encoded = encodeInvitePassword('himitsu', 'a1broom');

    expect(decodeInvitePassword(encoded, 'a1broom')).toBe('himitsu');
    expect(decodeInvitePassword(encoded, 'other')).not.toBe('himitsu');
  });

  it('writes one password differently for different rooms', () => {
    expect(encodeInvitePassword('himitsu', 'a1broom')).not.toBe(encodeInvitePassword('himitsu', 'xyzroom'));
  });

  it('uses only what survives an address', () => {
    const encoded = encodeInvitePassword('合言葉＆記号 <>"/+=', 'a1broom');

    expect(encoded).toMatch(/^[A-Za-z0-9\-_]*$/);
    expect(encodeURIComponent(encoded)).toBe(encoded);
  });

  it('returns nothing for a value it cannot restore', () => {
    expect(decodeInvitePassword('!!!', 'a1broom')).toBe('');
    expect(decodeInvitePassword('', 'a1broom')).toBe('');
  });
});

describe('the key of a room on a room server', () => {
  const key = '0123456789abcdef0123456789abcdef';

  it('travels in the link when there is one', () => {
    const link = buildInviteLink(BASE_URL, {
      roomId: 'a1b',
      roomName: 'room',
      roomKey: key,
      password: '',
      role: null,
      overlay: false,
    });

    expect(link).toBe(`${BASE_URL}#join?r=a1b&n=room&k=${key}`);
    expect(parseInviteLink(link.slice(link.indexOf('#')))?.roomKey).toBe(key);
  });

  it('is empty for a link written before rooms had keys', () => {
    expect(parseInviteLink('#join?r=a1b&n=room')?.roomKey).toBe('');
  });
});
