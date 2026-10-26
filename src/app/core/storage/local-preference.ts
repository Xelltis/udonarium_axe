/**
 * This browser's local storage, or null where the browser has none or refuses to hand it over, as
 * one set to block site data does the moment it is asked for.
 */
export function browserLocalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** A value this browser keeps, or null where it keeps none or refuses to say. */
export function readLocal(key: string): string | null {
  try {
    return browserLocalStorage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/**
 * Writes a value down in this browser, or takes it away for null. Answers whether it was written:
 * a browser that blocks site data, or has run out of room, refuses, and the value then holds only
 * for as long as the page is open.
 */
export function writeLocal(key: string, value: string | null): boolean {
  const storage = browserLocalStorage();
  if (!storage) return false;
  try {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
