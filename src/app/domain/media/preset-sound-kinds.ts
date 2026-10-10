import { VolumeType } from '@axe/core/storage/audio-player';

/** The built-in sounds of handling things on the table: dice, coins, cards, pieces and blocks, locks and sweeping. */
const HANDLING_KEYS: ReadonlySet<string> = new Set([
  'dicePick',
  'dicePut',
  'diceRoll1',
  'diceRoll2',
  'coinFlip',
  'cardDraw',
  'cardPick',
  'cardPut',
  'cardShuffle',
  'piecePick',
  'piecePut',
  'blockPick',
  'blockPut',
  'lock',
  'unlock',
  'sweep',
]);

/** The built-in sounds that tell the listener something has happened: the alarm and the chat notifications. */
const NOTIFICATION_KEYS: ReadonlySet<string> = new Set([
  'alarm',
  'chatPageTurnLong',
  'chatPageTurnShort',
  'chatBubble',
  'chatCyber',
  'chatNotify1',
  'chatNotify2',
]);

/**
 * The channel a built-in sound plays through, by its name among the built-in sounds.
 *
 * Handling and notification sounds are listed. Every other built-in sound belongs to an effect on
 * the map or to a value going up or down, and so plays through the effects channel.
 */
export function presetSoundKind(key: string): VolumeType {
  if (HANDLING_KEYS.has(key)) return VolumeType.HANDLING;
  if (NOTIFICATION_KEYS.has(key)) return VolumeType.NOTIFICATION;
  return VolumeType.EFFECT;
}
