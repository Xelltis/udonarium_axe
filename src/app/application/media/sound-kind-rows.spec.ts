import { PERSONAL_VOLUME_KINDS } from '@axe/application/media/personal-volumes';
import {
  ROOM_SOUND_KIND_ROWS,
  roomSoundKindRow,
  SOUND_KIND_ROWS,
  soundKindRow,
} from '@axe/application/media/sound-kind-rows';
import { ROOM_VOLUME_KINDS } from '@axe/domain/media/room-volumes';

describe('the rows a volume list shows', () => {
  it('lists every kind of the listener’s own in the order the settings keep, each under an input name of its own', () => {
    expect(SOUND_KIND_ROWS.map((row) => row.kind)).toEqual(PERSONAL_VOLUME_KINDS);
    expect(SOUND_KIND_ROWS.map((row) => row.name)).toEqual([
      'audition-volume',
      'bgm-volume',
      'background-volume',
      'cut-in-volume',
      'notification-volume',
      'handling-volume',
      'effect-volume',
      'se-volume',
    ]);
  });

  it('lists the room’s kinds with the icon each has among the listener’s own, under a name marked as the room’s', () => {
    expect(ROOM_SOUND_KIND_ROWS.map((row) => row.kind)).toEqual(ROOM_VOLUME_KINDS);
    expect(roomSoundKindRow('bgm')).toEqual({ kind: 'bgm', icon: soundKindRow('bgm').icon, name: 'room-bgm-volume' });
  });

  it('gives the music, the effects and the background sounds the icons the jukebox has always shown', () => {
    expect((['audition', 'bgm', 'se', 'background'] as const).map((kind) => soundKindRow(kind).icon)).toEqual([
      'headphones',
      'library_music',
      'star',
      'waves',
    ]);
  });
});
