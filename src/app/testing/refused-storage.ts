const refuse = () => {
  throw new DOMException('The site is blocked from keeping data.', 'SecurityError');
};

const REFUSING_STORAGE = {
  length: 0,
  key: refuse,
  getItem: refuse,
  setItem: refuse,
  removeItem: refuse,
  clear: refuse,
} as unknown as Storage;

/**
 * Hands the page a local storage that refuses every read and write, as a browser set to block site
 * data does. Undone by `vi.restoreAllMocks()`.
 *
 * The storage the tests share is left alone: a spy on its methods outlives the restore, since the
 * storage keeps hold of a method once it has been read.
 */
export function refuseLocalStorage(): void {
  vi.spyOn(globalThis, 'localStorage', 'get').mockReturnValue(REFUSING_STORAGE);
}

/**
 * Makes the browser refuse to hand its local storage over at all, as some do the moment the page
 * asks for it while site data is blocked. Undone by `vi.restoreAllMocks()`.
 */
export function refuseLocalStorageOutright(): void {
  vi.spyOn(globalThis, 'localStorage', 'get').mockImplementation(refuse);
}
