import { Playlist } from '@axe/domain/media/playlist';

describe('Playlist', () => {
  function makeFirst(): Playlist {
    const first = new Playlist(Playlist.DEFAULT_IDENTIFIER);
    first.initialize();
    return first;
  }

  it('makes a new playlist under a name, after the ones before it', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);

    const made = Playlist.create('Battle');

    expect(made.name).toBe('Battle');
    expect(made.createdAt).toBe(1000);
    expect(made.isDefault).toBe(false);
    expect(Playlist.all()).toContain(made);
  });

  it('puts the room’s first playlist first and the rest in the order they were made', () => {
    const nowSpy = vi.spyOn(Date, 'now');
    nowSpy.mockReturnValue(2000);
    const later = Playlist.create('Later');
    nowSpy.mockReturnValue(1000);
    const earlier = Playlist.create('Earlier');
    const first = makeFirst();

    expect(Playlist.all()).toEqual([first, earlier, later]);
  });

  it('knows the room’s first playlist by its identifier', () => {
    const first = makeFirst();

    expect(first.isDefault).toBe(true);
    expect(Playlist.instance).toBe(first);
  });

  it('reads a playlist an older version sent, without a name or a time, as nameless and first among the made ones', () => {
    const first = makeFirst();
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    const made = Playlist.create('Made');
    first.apply({ ...first.toContext(), syncData: { entries: ['a'] } });

    expect(first.name ?? '').toBe('');
    expect(first.entries).toEqual(['a']);
    expect(Playlist.all()).toEqual([first, made]);
  });

  it('does not put a track on twice', () => {
    const first = makeFirst();

    first.addEntry('a');
    first.addEntry('a');

    expect(first.entries).toEqual(['a']);
  });
});
