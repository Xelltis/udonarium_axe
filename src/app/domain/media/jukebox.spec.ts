import { ObjectContext } from '@axe/core/sync/game-object';
import { Jukebox } from '@axe/domain/media/jukebox';
import { JukeboxPlayback, SILENT_PLAYBACK } from '@axe/domain/media/jukebox-playback';

/** A playback that only notes what the jukebox asks of it. */
function listening(): JukeboxPlayback & { asked: string[] } {
  const asked: string[] = [];
  return {
    ...SILENT_PLAYBACK,
    asked,
    play: () => void asked.push('play'),
    applyEffects: () => void asked.push('effects'),
  };
}

/** The update another peer sends of the jukebox, playing a track or silent. */
function sentByTheRoom(jukebox: Jukebox, playing: boolean): ObjectContext {
  const context = jukebox.toContext();
  context.syncData = { ...context.syncData, audioIdentifier: 'track', isPlaying: playing };
  return context;
}

describe('Jukebox and the playback it is heard through', () => {
  it('plays the room’s track once a playback is attached, where the room’s first update came before it', () => {
    const jukebox = new Jukebox('Jukebox-late');
    jukebox.apply(sentByTheRoom(jukebox, true));
    const playback = listening();

    jukebox.usePlayback(playback);

    expect(playback.asked).toEqual(['play']);
  });

  it('only puts the effects on where the room it first heard of was silent', () => {
    const jukebox = new Jukebox('Jukebox-quiet');
    jukebox.apply(sentByTheRoom(jukebox, false));
    const playback = listening();

    jukebox.usePlayback(playback);

    expect(playback.asked).toEqual(['effects']);
  });

  it('asks nothing of a playback attached before the room’s first update, and follows that update when it comes', () => {
    const jukebox = new Jukebox('Jukebox-early');
    const playback = listening();

    jukebox.usePlayback(playback);
    expect(playback.asked).toEqual([]);

    jukebox.apply(sentByTheRoom(jukebox, true));
    expect(playback.asked).toEqual(['play']);
  });
});
