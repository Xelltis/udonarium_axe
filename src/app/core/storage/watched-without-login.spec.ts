import { hasWatchedWithoutLogin, noteWatchedWithoutLogin } from '@axe/core/storage/watched-without-login';

const STORAGE_KEY = 'udonarium-axe.watched-without-login';

describe('watched-without-login', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.removeItem(STORAGE_KEY);
  });

  it('remembers each room watched, under the key the tab has always kept them under', () => {
    expect(hasWatchedWithoutLogin('room-a')).toBe(false);

    noteWatchedWithoutLogin('room-a');
    noteWatchedWithoutLogin('room-b');
    noteWatchedWithoutLogin('room-a');

    expect(hasWatchedWithoutLogin('room-a')).toBe(true);
    expect(hasWatchedWithoutLogin('room-b')).toBe(true);
    expect(hasWatchedWithoutLogin('room-c')).toBe(false);
    expect(JSON.parse(sessionStorage.getItem(STORAGE_KEY)!)).toEqual(['room-a', 'room-b']);
  });

  it('reads what is not a list of keys as nothing watched', () => {
    sessionStorage.setItem(STORAGE_KEY, '{"room-a":true}');
    expect(hasWatchedWithoutLogin('room-a')).toBe(false);

    sessionStorage.setItem(STORAGE_KEY, 'not json');
    expect(hasWatchedWithoutLogin('room-a')).toBe(false);

    sessionStorage.setItem(STORAGE_KEY, '["room-a", 3]');
    expect(hasWatchedWithoutLogin('room-a')).toBe(true);
  });

  it('keeps nothing and throws nothing where the tab refuses storage', () => {
    vi.spyOn(globalThis, 'sessionStorage', 'get').mockImplementation(() => {
      throw new DOMException('The site is blocked from keeping data.', 'SecurityError');
    });

    expect(() => noteWatchedWithoutLogin('room-a')).not.toThrow();
    expect(hasWatchedWithoutLogin('room-a')).toBe(false);
  });
});
