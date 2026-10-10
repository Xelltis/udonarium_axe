import { TranslateFn } from '@axe/application/i18n/translate.token';
import { ContextMenuAction, ContextMenuSeparator } from '@axe/application/ui/context-menu.service';

/** A playlist a track could go to, and whether it is on that one already. */
export interface PlaylistTarget {
  identifier: string;
  label: string;
  holdsTrack: boolean;
}

/**
 * The menu of a track on a playlist: moving it up and down that list, then moving or copying it
 * to another playlist.
 *
 * Moving a track to a playlist that has it already only takes it off this one. A playlist that has
 * it already is not offered for a copy, and with nowhere left to copy it the copy is left out. With
 * no other playlist at all, only the moves within the list remain.
 */
export function buildPlaylistTrackMenu(
  reorder: ContextMenuAction[],
  others: readonly PlaylistTarget[],
  callbacks: { moveTo: (identifier: string) => void; copyTo: (identifier: string) => void },
  t: TranslateFn
): ContextMenuAction[] {
  const actions = [...reorder];
  if (others.length === 0) return actions;
  if (actions.length > 0) actions.push(ContextMenuSeparator);
  actions.push({
    name: t('feature.media.jukebox.moveToPlaylist'),
    subActions: others.map((target) => ({
      name: target.label,
      action: () => callbacks.moveTo(target.identifier),
    })),
  });
  const copyable = others.filter((target) => !target.holdsTrack);
  if (copyable.length > 0) {
    actions.push({
      name: t('feature.media.jukebox.copyToPlaylist'),
      subActions: copyable.map((target) => ({
        name: target.label,
        action: () => callbacks.copyTo(target.identifier),
      })),
    });
  }
  return actions;
}

/**
 * The menu of a track in the library: every playlist with a box ticked for those that have the
 * track, choosing one putting it on or taking it off.
 */
export function buildLibraryTrackMenu(
  playlists: readonly PlaylistTarget[],
  callbacks: { addTo: (identifier: string) => void; removeFrom: (identifier: string) => void },
  t: TranslateFn
): ContextMenuAction[] {
  if (playlists.length === 0) return [];
  return [
    {
      name: t('feature.media.jukebox.playlistsOfTrack'),
      subActions: playlists.map((target) => ({
        name: `${target.holdsTrack ? '☑' : '☐'}${target.label}`,
        action: () => (target.holdsTrack ? callbacks.removeFrom : callbacks.addTo)(target.identifier),
      })),
    },
  ];
}
