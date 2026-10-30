import { readLocal, writeLocal } from '@axe/core/storage/local-preference';
import { STORAGE_KEYS } from '@axe/core/storage/storage-keys';

/** The accounts that chose their icon by hand in this browser. */
function accountsChosen(): string[] {
  try {
    const kept: unknown = JSON.parse(readLocal(STORAGE_KEYS.iconChosenByHand) ?? '[]');
    return Array.isArray(kept) ? kept.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Whether an account has chosen its icon by hand in this browser, after which its avatar is no
 * longer put on as the icon at login, the icon a reload takes back to the default staying so.
 */
export function hasChosenIconByHand(accountUserId: string): boolean {
  return accountsChosen().includes(accountUserId);
}

/** Notes that an account chose its icon by hand, in this browser and for good. */
export function noteIconChosenByHand(accountUserId: string): void {
  const chosen = accountsChosen();
  if (!accountUserId || chosen.includes(accountUserId)) return;
  writeLocal(STORAGE_KEYS.iconChosenByHand, JSON.stringify([...chosen, accountUserId]));
}
