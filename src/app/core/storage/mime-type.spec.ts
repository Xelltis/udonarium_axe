import * as MimeType from '@axe/core/storage/mime-type';

describe('MimeType', () => {
  describe('type()', () => {
    it('types a png', () => {
      expect(MimeType.type('image.png')).toBe('image/png');
    });

    it('types a jpg', () => {
      expect(MimeType.type('photo.jpg')).toBe('image/jpeg');
    });

    it('types a jpeg', () => {
      expect(MimeType.type('photo.jpeg')).toBe('image/jpeg');
    });

    it('types a gif', () => {
      expect(MimeType.type('anim.gif')).toBe('image/gif');
    });

    it('types a webp', () => {
      expect(MimeType.type('image.webp')).toBe('image/webp');
    });

    it('types an svg', () => {
      expect(MimeType.type('icon.svg')).toBe('image/svg+xml');
    });

    it('types an mp3', () => {
      expect(MimeType.type('sound.mp3')).toBe('audio/mp3');
    });

    it('types a wav', () => {
      expect(MimeType.type('sound.wav')).toBe('audio/wav');
    });

    it('types an ogg', () => {
      expect(MimeType.type('sound.ogg')).toBe('audio/ogg');
    });

    it('types an m4a as MP4 audio, and AAC on its own as AAC', () => {
      expect(MimeType.type('sound.m4a')).toBe('audio/mp4');
      expect(MimeType.type('sound.aac')).toBe('audio/aac');
    });

    it('types the other names an Ogg file goes by as Ogg', () => {
      expect(MimeType.type('sound.opus')).toBe('audio/ogg');
      expect(MimeType.type('sound.oga')).toBe('audio/ogg');
    });

    it('types a flac', () => {
      expect(MimeType.type('sound.FLAC')).toBe('audio/flac');
    });

    it('types an mp4', () => {
      expect(MimeType.type('video.mp4')).toBe('video/mp4');
    });

    it('types an html file', () => {
      expect(MimeType.type('page.html')).toBe('text/html');
    });

    it('types a json file', () => {
      expect(MimeType.type('data.json')).toBe('application/json');
    });

    it('types a zip', () => {
      expect(MimeType.type('archive.zip')).toBe('application/zip');
    });

    it('recognises an extension in capitals', () => {
      expect(MimeType.type('IMAGE.PNG')).toBe('image/png');
    });

    it('takes the last extension from a path with several dots', () => {
      expect(MimeType.type('some.file.name.jpg')).toBe('image/jpeg');
    });

    it('returns nothing for an extension it does not know', () => {
      expect(MimeType.type('file.unknown')).toBe('');
    });

    it('types a yaml file', () => {
      expect(MimeType.type('config.yaml')).toBe('text/yaml');
    });

    it('types an avif', () => {
      expect(MimeType.type('image.avif')).toBe('image/avif');
    });
  });

  describe('extension()', () => {
    it('names a png', () => {
      expect(MimeType.extension('image/png')).toBe('png');
    });

    it('names a jpeg', () => {
      expect(MimeType.extension('image/jpeg')).toBe('jpg');
    });

    it('names an mp3', () => {
      expect(MimeType.extension('audio/mp3')).toBe('mp3');
    });

    it('falls back to the subtype for a type it does not know', () => {
      expect(MimeType.extension('application/octet-stream')).toBe('octet-stream');
    });

    it('names a gif', () => {
      expect(MimeType.extension('image/gif')).toBe('gif');
    });
  });
});
