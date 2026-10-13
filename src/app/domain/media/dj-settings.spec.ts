import { DEFAULT_DJ_SETTINGS, readDjSettings, writeDjSettings } from '@axe/domain/media/dj-settings';

describe('DJ settings', () => {
  it('writes nothing while every setting is at its default', () => {
    expect(writeDjSettings(DEFAULT_DJ_SETTINGS)).toBe('');
  });

  it('writes only what differs from the defaults, and reads it back', () => {
    const settings = { ...DEFAULT_DJ_SETTINGS, ducking: false, crossfadeS: 8, beatLight: true };
    const text = writeDjSettings(settings);

    expect(JSON.parse(text)).toEqual({ ducking: false, crossfadeS: 8, beatLight: true });
    expect(readDjSettings(text)).toEqual(settings);
  });

  it('reads empty or broken text as the defaults', () => {
    expect(readDjSettings('')).toEqual(DEFAULT_DJ_SETTINGS);
    expect(readDjSettings(undefined)).toEqual(DEFAULT_DJ_SETTINGS);
    expect(readDjSettings('{"ducking":')).toEqual(DEFAULT_DJ_SETTINGS);
    expect(readDjSettings('[false]')).toEqual(DEFAULT_DJ_SETTINGS);
  });

  it('takes only JSON true and false for a switch', () => {
    expect(readDjSettings(JSON.stringify({ autoLevel: 'false', ducking: 0, quantize: '1' }))).toEqual(
      DEFAULT_DJ_SETTINGS
    );
    expect(readDjSettings(JSON.stringify({ autoLevel: false })).autoLevel).toBe(false);
  });

  it('reads a fade for a pause out of range as the default, and keeps a cut', () => {
    expect(readDjSettings(JSON.stringify({ pauseFadeS: 30 })).pauseFadeS).toBe(0.4);
    expect(readDjSettings(JSON.stringify({ pauseFadeS: '2' })).pauseFadeS).toBe(0.4);
    expect(readDjSettings(JSON.stringify({ pauseFadeS: 0 })).pauseFadeS).toBe(0);
    expect(readDjSettings(writeDjSettings({ ...DEFAULT_DJ_SETTINGS, pauseFadeS: 4 })).pauseFadeS).toBe(4);
  });

  it('reads a fade that is missing, empty or out of range as the default, and keeps none at all', () => {
    expect(readDjSettings(JSON.stringify({ crossfadeS: '' })).crossfadeS).toBe(2);
    expect(readDjSettings(JSON.stringify({ crossfadeS: 40 })).crossfadeS).toBe(2);
    expect(readDjSettings(JSON.stringify({ crossfadeS: -1 })).crossfadeS).toBe(2);
    expect(readDjSettings(JSON.stringify({ crossfadeS: 0 })).crossfadeS).toBe(0);
  });
});
