import { ContextMenuAction, ContextMenuSeparator } from '@axe/application/ui/context-menu.service';
import {
  buildLibraryTrackMenu,
  buildPlaylistTrackMenu,
  PlaylistTarget,
} from '@axe/features/media/jukebox/playlist-context-menu';

const t = (key: string) => key;

const battle: PlaylistTarget = { identifier: 'battle', label: 'Battle', holdsTrack: false };
const town: PlaylistTarget = { identifier: 'town', label: 'Town', holdsTrack: true };

function names(actions: ContextMenuAction[] | undefined): string[] {
  return (actions ?? []).map((action) => action.name);
}

describe('buildPlaylistTrackMenu', () => {
  const reorder: ContextMenuAction[] = [{ name: 'common.reorder.up', action: () => {} }];

  it('follows the moves within the list with moving and copying to the other playlists', () => {
    const actions = buildPlaylistTrackMenu(reorder, [battle, town], { moveTo: () => {}, copyTo: () => {} }, t);

    expect(names(actions)).toEqual([
      'common.reorder.up',
      '',
      'feature.media.jukebox.moveToPlaylist',
      'feature.media.jukebox.copyToPlaylist',
    ]);
    expect(actions[1]).toBe(ContextMenuSeparator);
    expect(names(actions[2].subActions)).toEqual(['Battle', 'Town']);
    expect(names(actions[3].subActions)).toEqual(['Battle']);
  });

  it('moves and copies to the playlist chosen', () => {
    const moveTo = vi.fn();
    const copyTo = vi.fn();
    const actions = buildPlaylistTrackMenu([], [battle], { moveTo, copyTo }, t);

    actions[0].subActions![0].action!();
    actions[1].subActions![0].action!();

    expect(moveTo).toHaveBeenCalledWith('battle');
    expect(copyTo).toHaveBeenCalledWith('battle');
  });

  it('leaves out the copy when every other playlist has the track already', () => {
    const actions = buildPlaylistTrackMenu([], [town], { moveTo: () => {}, copyTo: () => {} }, t);

    expect(names(actions)).toEqual(['feature.media.jukebox.moveToPlaylist']);
  });

  it('offers only the moves within the list when there is no other playlist', () => {
    expect(buildPlaylistTrackMenu(reorder, [], { moveTo: () => {}, copyTo: () => {} }, t)).toEqual(reorder);
  });

  it('starts without a separator when the list has no move to offer', () => {
    const actions = buildPlaylistTrackMenu([], [battle], { moveTo: () => {}, copyTo: () => {} }, t);

    expect(actions[0].name).toBe('feature.media.jukebox.moveToPlaylist');
  });
});

describe('buildLibraryTrackMenu', () => {
  it('lists every playlist, ticked where the track is', () => {
    const actions = buildLibraryTrackMenu([battle, town], { addTo: () => {}, removeFrom: () => {} }, t);

    expect(names(actions)).toEqual(['feature.media.jukebox.playlistsOfTrack']);
    expect(names(actions[0].subActions)).toEqual(['☐Battle', '☑Town']);
  });

  it('puts the track on an unticked playlist and takes it off a ticked one', () => {
    const addTo = vi.fn();
    const removeFrom = vi.fn();
    const actions = buildLibraryTrackMenu([battle, town], { addTo, removeFrom }, t);

    actions[0].subActions![0].action!();
    actions[0].subActions![1].action!();

    expect(addTo).toHaveBeenCalledWith('battle');
    expect(removeFrom).toHaveBeenCalledWith('town');
  });

  it('offers nothing without a playlist', () => {
    expect(buildLibraryTrackMenu([], { addTo: () => {}, removeFrom: () => {} }, t)).toEqual([]);
  });
});
