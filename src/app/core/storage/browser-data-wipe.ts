import { Logger } from '@axe/core/logging/logger';
import { APP_DATABASES } from '@axe/core/storage/app-database-names';

const WIPE_REQUEST_KEY = 'axe-wipe-browser-data';

/** How long a database may keep the wipe waiting, as another tab that holds it open does. */
const DELETE_TIMEOUT_MS = 5000;

/**
 * Asks for everything the app keeps in this browser to be thrown away when the page next loads,
 * before the app starts.
 *
 * Wiping on the next load rather than now leaves nothing of this page to write it back: a
 * recording saves what it holds as the page goes, and every setting is still held in memory.
 * Answers false when the request could not be written down, as where session storage is refused.
 */
export function requestBrowserDataWipe(): boolean {
  try {
    sessionStorage.setItem(WIPE_REQUEST_KEY, '1');
    return true;
  } catch {
    return false;
  }
}

/**
 * Throws away everything the app keeps in this browser when the page before asked for it, and
 * answers whether it did.
 *
 * Meant to run before the app starts, so that it starts as it would in a browser that has never
 * seen it.
 */
export async function wipeBrowserDataIfRequested(): Promise<boolean> {
  if (!isWipeRequested()) return false;
  await wipeBrowserData();
  return true;
}

/**
 * Throws away local storage, session storage and every database of this site in this browser.
 *
 * Each part is wiped as far as the browser allows, and one it refuses does not stop the rest. A
 * database another tab holds open is left to be deleted once that tab lets it go, rather than
 * keeping the page waiting.
 */
export async function wipeBrowserData(): Promise<void> {
  clearStorage('localStorage');
  clearStorage('sessionStorage');
  const names = await databaseNames();
  await Promise.all(names.map(deleteDatabase));
}

function isWipeRequested(): boolean {
  try {
    return sessionStorage.getItem(WIPE_REQUEST_KEY) !== null;
  } catch {
    return false;
  }
}

function clearStorage(name: 'localStorage' | 'sessionStorage'): void {
  try {
    window[name].clear();
  } catch (reason) {
    Logger.warn(`[BrowserDataWipe] could not clear ${name}`, reason);
  }
}

/** The databases this browser holds for the site, with the app's own named for one that cannot list them. */
async function databaseNames(): Promise<string[]> {
  if (typeof indexedDB === 'undefined' || !indexedDB) return [];
  const names = new Set<string>(APP_DATABASES);
  try {
    const listed = typeof indexedDB.databases === 'function' ? await indexedDB.databases() : [];
    for (const database of listed) if (database.name) names.add(database.name);
  } catch (reason) {
    Logger.warn('[BrowserDataWipe] could not list the databases', reason);
  }
  return [...names];
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      Logger.warn(`[BrowserDataWipe] ${name} is held open elsewhere and goes once it is let go`);
      resolve();
    }, DELETE_TIMEOUT_MS);
    const done = (): void => {
      clearTimeout(timer);
      resolve();
    };
    try {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = done;
      request.onerror = () => {
        Logger.warn(`[BrowserDataWipe] could not delete ${name}`, request.error);
        done();
      };
    } catch (reason) {
      Logger.warn(`[BrowserDataWipe] could not delete ${name}`, reason);
      done();
    }
  });
}
