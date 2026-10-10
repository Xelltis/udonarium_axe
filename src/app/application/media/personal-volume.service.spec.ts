import { TestBed } from '@angular/core/testing';
import { PERSONAL_VOLUME_CHANNELS, PersonalVolumeService } from '@axe/application/media/personal-volume.service';
import {
  DEFAULT_PERSONAL_VOLUMES,
  formatPersonalSound,
  parsePersonalSound,
  parsePersonalVolumes,
  PERSONAL_VOLUME_KINDS,
  PERSONAL_VOLUME_STORAGE_KEY,
} from '@axe/application/media/personal-volumes';
import { AudioPlayer, VolumeType } from '@axe/core/storage/audio-player';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Jukebox } from '@axe/domain/media/jukebox';
import { Config } from '@axe/domain/peer/config';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

/** A fresh service reading what this browser holds, as a page opened again would. */
function reopened(): PersonalVolumeService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
  return TestBed.inject(PersonalVolumeService);
}

/** Stands in for the channels, answering the last volume each was set to. */
function channels(): (type: VolumeType) => number | undefined {
  const set = vi.spyOn(AudioPlayer, 'setChannelVolume').mockImplementation(() => {});
  return (type) => set.mock.calls.filter(([called]) => called === type).at(-1)?.[1];
}

describe('PersonalVolumeService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts every volume at half, with nothing turned off', () => {
    channels();
    const volumes = reopened();

    expect(PERSONAL_VOLUME_KINDS.map((kind) => volumes.get(kind))).toEqual(PERSONAL_VOLUME_KINDS.map(() => 0.5));
    expect(PERSONAL_VOLUME_KINDS.some((kind) => volumes.isMuted(kind))).toBe(false);
  });

  it('remembers a volume in this browser, so it holds when the page is opened again', () => {
    channels();
    reopened().set('se', 0.2);
    reopened().set('handling', 0.7);

    const volumes = reopened();
    expect(volumes.get('se')).toBe(0.2);
    expect(volumes.get('handling')).toBe(0.7);
    expect(volumes.get('bgm')).toBe(0.5);
  });

  it('makes a volume heard at once on its own channel, scaled by the room volume, and puts it on the jukebox', () => {
    const heard = channels();
    const volumes = reopened();
    new Config('Config').initialize();
    ObjectStore.instance.get<Config>('Config')!.roomVolume = 0.5;
    new Jukebox('Jukebox').initialize();

    volumes.set('bgm', 0.8);
    volumes.set('notification', 0.6);

    expect(heard(VolumeType.MASTER)).toBeCloseTo(0.4);
    expect(heard(VolumeType.NOTIFICATION)).toBeCloseTo(0.3);
    const jukebox = ObjectStore.instance.get<Jukebox>('Jukebox')!;
    expect(jukebox.volume).toBe(0.8);
    expect(jukebox.levelOf(VolumeType.NOTIFICATION)).toBe(0.6);
  });

  it('scales a volume by the room’s volume for its kind as well', () => {
    const heard = channels();
    const volumes = reopened();
    new Config('Config').initialize();
    const config = ObjectStore.instance.get<Config>('Config')!;
    config.roomVolume = 0.5;
    config.setRoomVolumeOf('notification', 1.5);
    config.setRoomVolumeOf('effect', 0);

    volumes.set('notification', 0.8);
    volumes.set('effect', 0.8);

    expect(heard(VolumeType.NOTIFICATION)).toBeCloseTo(0.6);
    expect(heard(VolumeType.EFFECT)).toBe(0);
  });

  it('silences a kind turned off, keeps its volume, and brings it back when turned on', () => {
    const heard = channels();
    const volumes = reopened();
    volumes.set('handling', 0.7);

    volumes.setMuted('handling', true);
    expect(volumes.isMuted('handling')).toBe(true);
    expect(volumes.levelOf('handling')).toBe(0);
    expect(volumes.get('handling')).toBe(0.7);
    expect(heard(VolumeType.HANDLING)).toBe(0);

    volumes.setMuted('handling', false);
    expect(volumes.levelOf('handling')).toBe(0.7);
    expect(heard(VolumeType.HANDLING)).toBeCloseTo(0.7);
  });

  it('remembers a kind turned off, so it stays off when the page is opened again', () => {
    channels();
    reopened().setMuted('effect', true);

    expect(reopened().isMuted('effect')).toBe(true);
  });

  it('keeps a kind turned off silent when the room volume changes', () => {
    const heard = channels();
    const volumes = reopened();
    new Config('Config').initialize();
    const jukebox = new Jukebox('Jukebox');
    jukebox.initialize();
    volumes.setMuted('cutIn', true);

    ObjectStore.instance.get<Config>('Config')!.roomVolume = 1.5;
    jukebox.setNewVolume();

    expect(heard(VolumeType.CUT_IN)).toBe(0);
    expect(heard(VolumeType.SE)).toBeCloseTo(0.75);
  });

  it('hands the remembered volumes to the jukebox and the players as the app starts', () => {
    localStorage.setItem(
      PERSONAL_VOLUME_STORAGE_KEY,
      JSON.stringify({ audition: 0.1, bgm: 0.2, se: 0.3, background: 0.4, cutIn: 0.6, muted: ['effect'] })
    );
    const heard = channels();
    const volumes = reopened();
    const jukebox = new Jukebox('Jukebox');
    jukebox.initialize();

    volumes.restore();

    expect([jukebox.auditionVolume, jukebox.volume, jukebox.seVolume, jukebox.backgroundVolume]).toEqual([
      0.1, 0.2, 0.3, 0.4,
    ]);
    expect(heard(VolumeType.AUDITION)).toBe(0.1);
    expect(heard(VolumeType.CUT_IN)).toBe(0.6);
    expect(heard(VolumeType.EFFECT)).toBe(0);
    expect(heard(VolumeType.HANDLING)).toBe(0.5);
  });

  it('keeps a volume for the session when the browser refuses to write it down', () => {
    channels();
    const volumes = reopened();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('private browsing');
    });

    expect(() => volumes.set('bgm', 0.3)).not.toThrow();
    expect(volumes.get('bgm')).toBe(0.3);
  });

  it('gives every kind a channel, no two the same', () => {
    const used = PERSONAL_VOLUME_KINDS.map((kind) => PERSONAL_VOLUME_CHANNELS[kind]);
    expect(new Set(used).size).toBe(PERSONAL_VOLUME_KINDS.length);
  });
});

describe('parsePersonalSound()', () => {
  it('takes the defaults when nothing was written down, or what was cannot be read', () => {
    for (const raw of [null, 'not json', 'null', '[]', '3']) {
      expect(parsePersonalSound(raw)).toEqual({ volumes: DEFAULT_PERSONAL_VOLUMES, muted: [] });
    }
  });

  it('reads what a version that knew only four kinds wrote down, with the rest at half', () => {
    const read = parsePersonalSound(JSON.stringify({ audition: 0.1, bgm: 0.2, se: 0.3, background: 0.4 }));

    expect(read.volumes).toEqual({
      audition: 0.1,
      bgm: 0.2,
      se: 0.3,
      background: 0.4,
      cutIn: 0.5,
      notification: 0.5,
      handling: 0.5,
      effect: 0.5,
    });
    expect(read.muted).toEqual([]);
  });

  it('takes the default for a volume missing, not a number or outside 0 to 1, and keeps the rest', () => {
    expect(parsePersonalVolumes(JSON.stringify({ bgm: 0.25, se: '0.3', audition: 2, background: -1 }))).toMatchObject({
      audition: 0.5,
      bgm: 0.25,
      se: 0.5,
      background: 0.5,
    });
  });

  it('keeps a volume turned right down', () => {
    expect(parsePersonalVolumes(JSON.stringify({ bgm: 0 })).bgm).toBe(0);
  });

  it('keeps only the kinds it knows of those turned off, each once, and nothing that is not a list', () => {
    expect(parsePersonalSound(JSON.stringify({ muted: ['handling', 'radio', 'handling', 3, 'se'] })).muted).toEqual([
      'handling',
      'se',
    ]);
    expect(parsePersonalSound(JSON.stringify({ muted: 'handling' })).muted).toEqual([]);
  });

  it('reads back what it writes down', () => {
    const sound = parsePersonalSound(JSON.stringify({ cutIn: 0.3, muted: ['notification'] }));

    expect(parsePersonalSound(formatPersonalSound(sound))).toEqual(sound);
  });
});
