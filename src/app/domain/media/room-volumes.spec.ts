import { VolumeType } from '@axe/core/storage/audio-player';
import {
  DEFAULT_ROOM_VOLUMES,
  readRoomVolumes,
  roomVolumeKindOf,
  writeRoomVolumes,
} from '@axe/domain/media/room-volumes';

describe('room volumes', () => {
  it('reads full volume for every kind from a room that has none', () => {
    expect(readRoomVolumes('')).toEqual(DEFAULT_ROOM_VOLUMES);
    expect(readRoomVolumes(undefined)).toEqual(DEFAULT_ROOM_VOLUMES);
    expect(readRoomVolumes(null)).toEqual(DEFAULT_ROOM_VOLUMES);
  });

  it('reads full volume from text that cannot be read', () => {
    expect(readRoomVolumes('{bgm:')).toEqual(DEFAULT_ROOM_VOLUMES);
    expect(readRoomVolumes('null')).toEqual(DEFAULT_ROOM_VOLUMES);
    expect(readRoomVolumes('3')).toEqual(DEFAULT_ROOM_VOLUMES);
  });

  it('keeps a kind the room turned off at 0 rather than reading it as full', () => {
    expect(readRoomVolumes('{"handling":0}').handling).toBe(0);
  });

  it('reads a kind missing, not a number or out of range as full, keeping the others', () => {
    const volumes = readRoomVolumes('{"bgm":0.4,"se":"0.5","effect":2.5,"cutIn":-1,"handling":null}');

    expect(volumes).toEqual({ ...DEFAULT_ROOM_VOLUMES, bgm: 0.4 });
  });

  it('writes nothing while every kind is at full volume', () => {
    expect(writeRoomVolumes(DEFAULT_ROOM_VOLUMES)).toBe('');
  });

  it('writes only the kinds turned away from full, which read back as they were', () => {
    const volumes = { ...DEFAULT_ROOM_VOLUMES, bgm: 0.6, handling: 0, background: 1.8 };

    const written = writeRoomVolumes(volumes);

    expect(JSON.parse(written)).toEqual({ bgm: 0.6, background: 1.8, handling: 0 });
    expect(readRoomVolumes(written)).toEqual(volumes);
  });

  it('sets the volume of each channel by its kind, and of the preview channel by none', () => {
    expect(roomVolumeKindOf(VolumeType.MASTER)).toBe('bgm');
    expect(roomVolumeKindOf(VolumeType.BACKGROUND)).toBe('background');
    expect(roomVolumeKindOf(VolumeType.CUT_IN)).toBe('cutIn');
    expect(roomVolumeKindOf(VolumeType.NOTIFICATION)).toBe('notification');
    expect(roomVolumeKindOf(VolumeType.HANDLING)).toBe('handling');
    expect(roomVolumeKindOf(VolumeType.EFFECT)).toBe('effect');
    expect(roomVolumeKindOf(VolumeType.SE)).toBe('se');
    expect(roomVolumeKindOf(VolumeType.AUDITION)).toBeNull();
  });
});
