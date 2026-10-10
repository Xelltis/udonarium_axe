import { groupReplayChildren, replayValueOfNamed } from '@axe/domain/replay/replay-data-tree';
import { syncValueOf } from '@axe/domain/replay/replay-diff';
import type { ReplayObjectSnapshot } from '@axe/domain/replay/replay-keyframe';

export interface ReplayCastMember {
  identifier: string;
  name: string;
  imageIdentifier: string;
  chatColor: string;
  /** Whether it was on the board when the recording opened, which is how one put away is told apart. */
  onTable: boolean;
}

const CHARACTER_ALIAS = 'character';

/** Every character in the snapshots, with its name, picture, first chat colour and whether it was on the table. */
export function collectReplayCast(snapshots: readonly ReplayObjectSnapshot[]): ReplayCastMember[] {
  const childrenOf = groupReplayChildren(snapshots);

  const cast: ReplayCastMember[] = [];
  for (const snapshot of snapshots) {
    if (snapshot.aliasName !== CHARACTER_ALIAS) continue;
    cast.push({
      identifier: snapshot.identifier,
      name: replayValueOfNamed(childrenOf, snapshot.identifier, ['common', 'name']),
      imageIdentifier: replayValueOfNamed(childrenOf, snapshot.identifier, ['image', 'imageIdentifier']),
      chatColor: firstChatColor(snapshot),
      onTable: locationNameOf(snapshot) === 'table',
    });
  }
  return cast;
}

/**
 * Who is in the keepsake photo.
 *
 * Only the pieces that were out are photographed; with those put away as well the sheet fills with faces that were not there that day.
 * In a recording where none was out there would be nobody to photograph, so it returns them all.
 */
export function replayCastOnTable(cast: readonly ReplayCastMember[]): ReplayCastMember[] {
  const onTable = cast.filter((member) => member.onTable);
  return onTable.length > 0 ? onTable : [...cast];
}

function locationNameOf(snapshot: ReplayObjectSnapshot): string {
  const location = syncValueOf(snapshot.syncData, 'location');
  if (!location || typeof location !== 'object') return '';
  const name = (location as Record<string, unknown>)['name'];
  return typeof name === 'string' ? name : '';
}

function firstChatColor(snapshot: ReplayObjectSnapshot): string {
  const colors = syncValueOf(snapshot.syncData, 'chatColorCode');
  return Array.isArray(colors) && typeof colors[0] === 'string' ? colors[0] : '';
}
