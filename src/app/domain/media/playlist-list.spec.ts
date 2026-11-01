import { ObjectSerializer } from '@axe/core/sync/object-serializer';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Playlist } from '@axe/domain/media/playlist';
import { PlaylistList } from '@axe/domain/media/playlist-list';

describe('PlaylistList', () => {
  function makeFirst(entries: string[] = []): Playlist {
    const first = new Playlist(Playlist.DEFAULT_IDENTIFIER);
    first.entries = entries;
    first.initialize();
    return first;
  }

  function savedRoom(): string {
    const first = makeFirst(['town-a', 'town-b']);
    first.name = 'Town';
    Playlist.create('Battle', ['battle-a'], 1000);
    Playlist.create('Boss & Co.', ['boss-a', 'boss-b'], 2000);
    const xml = ObjectSerializer.instance.toXml(new PlaylistList());
    for (const playlist of Playlist.all()) playlist.destroy();
    return xml;
  }

  it('writes every playlist in order, the first one marked, with its tracks', () => {
    const xml = savedRoom();

    expect(xml).toContain('<list name="Town" default="true"><entry audio="town-a"/><entry audio="town-b"/></list>');
    expect(xml.indexOf('name="Battle"')).toBeLessThan(xml.indexOf('name="Boss &amp; Co."'));
  });

  it('puts the saved playlists back in a room that starts with only an empty first one', () => {
    const xml = savedRoom();
    const firstHere = makeFirst();

    ObjectSerializer.instance.parseXml(xml);

    const lists = Playlist.all();
    expect(lists[0]).toBe(firstHere);
    expect(lists.map((playlist) => [playlist.name, playlist.entries])).toEqual([
      ['Town', ['town-a', 'town-b']],
      ['Battle', ['battle-a']],
      ['Boss & Co.', ['boss-a', 'boss-b']],
    ]);
  });

  it('puts them in place of the playlists the room had, rather than beside them', () => {
    const xml = savedRoom();
    makeFirst(['old']);
    const old = Playlist.create('Old', ['old'], 500);

    ObjectSerializer.instance.parseXml(xml);

    expect(Playlist.all()).not.toContain(old);
    expect(Playlist.all().map((playlist) => playlist.name)).toEqual(['Town', 'Battle', 'Boss & Co.']);
  });

  it('empties the first playlist when the save brings none for it', () => {
    makeFirst(['here']).name = 'Here';

    ObjectSerializer.instance.parseXml('<playlist-list><list name="Only"><entry audio="a"/></list></playlist-list>');

    expect(Playlist.instance?.name).toBe('');
    expect(Playlist.instance?.entries).toEqual([]);
    expect(Playlist.all().map((playlist) => playlist.name)).toEqual(['', 'Only']);
  });

  it('passes over a track written twice or naming no sound', () => {
    makeFirst();

    ObjectSerializer.instance.parseXml(
      '<playlist-list><list default="true"><entry audio="a"/><entry audio=""/><entry/><entry audio="a"/><other audio="b"/></list></playlist-list>'
    );

    expect(Playlist.instance?.entries).toEqual(['a']);
  });

  it('stays out of the room, being only a holder for the save', () => {
    ObjectSerializer.instance.parseXml('<playlist-list></playlist-list>');

    expect(ObjectStore.instance.getObjects(PlaylistList)).toEqual([]);
  });
});
