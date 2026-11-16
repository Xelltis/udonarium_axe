import { AudioFile, AudioFileContext, AudioState } from '@axe/core/storage/audio-file';

describe('AudioFile', () => {
  let createObjectURLSpy: ReturnType<typeof vi.spyOn>;
  let revokeObjectURLSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
    revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ----------------------------------------------------------------
  // isHidden
  // ----------------------------------------------------------------
  describe('isHidden', () => {
    it('is false by default', () => {
      const audio = AudioFile.createEmpty('id1');
      expect(audio.isHidden).toBe(false);
    });
  });

  // ----------------------------------------------------------------
  // AudioState
  // ----------------------------------------------------------------
  describe('state', () => {
    it('is empty with neither a url nor bytes', () => {
      const audio = AudioFile.createEmpty('id1');
      expect(audio.state).toBe(AudioState.NULL);
    });

    it('carries a url with no bytes', () => {
      const audio = AudioFile.create('https://example.com/sound.mp3');
      expect(audio.state).toBe(AudioState.URL);
    });

    it('is complete once it has bytes', () => {
      const context: AudioFileContext = {
        identifier: 'id1',
        name: 'sound.mp3',
        type: 'audio/mpeg',
        blob: new Blob(['data'], { type: 'audio/mpeg' }),
        url: '',
      };
      const audio = AudioFile.create(context);
      expect(audio.state).toBe(AudioState.COMPLETE);
    });

    it('is complete with both', () => {
      const context: AudioFileContext = {
        identifier: 'id1',
        name: 'sound.mp3',
        type: 'audio/mpeg',
        blob: new Blob(['data'], { type: 'audio/mpeg' }),
        url: 'https://example.com/sound.mp3',
      };
      const audio = AudioFile.create(context);
      expect(audio.state).toBe(AudioState.COMPLETE);
    });
  });

  // ----------------------------------------------------------------
  // isReady
  // ----------------------------------------------------------------
  describe('isReady', () => {
    it('is false while empty', () => {
      const audio = AudioFile.createEmpty('id1');
      expect(audio.isReady).toBe(false);
    });

    it('is true once it has a url', () => {
      const audio = AudioFile.create('https://example.com/sound.mp3');
      expect(audio.isReady).toBe(true);
    });
  });

  // ----------------------------------------------------------------
  // createEmpty
  // ----------------------------------------------------------------
  describe('createEmpty', () => {
    it('sets an identifier', () => {
      const audio = AudioFile.createEmpty('test-id');
      expect(audio.identifier).toBe('test-id');
    });

    it('leaves the name, url and bytes empty', () => {
      const audio = AudioFile.createEmpty('test-id');
      expect(audio.name).toBe('');
      expect(audio.url).toBe('');
      expect(audio.blob).toBeNull();
    });
  });

  // ----------------------------------------------------------------
  // create(string)
  // ----------------------------------------------------------------
  describe('create(url: string)', () => {
    it('takes the identifier, name and url it is given', () => {
      const url = 'https://example.com/sound.mp3';
      const audio = AudioFile.create(url);
      expect(audio.identifier).toBe(url);
      expect(audio.name).toBe(url);
      expect(audio.url).toBe(url);
    });

    it('carries a url', () => {
      const audio = AudioFile.create('https://example.com/sound.mp3');
      expect(audio.state).toBe(AudioState.URL);
    });
  });

  // ----------------------------------------------------------------
  // create(AudioFileContext)
  // ----------------------------------------------------------------
  describe('create(context: AudioFileContext)', () => {
    it('takes the values from a context', () => {
      const blob = new Blob(['data'], { type: 'audio/mpeg' });
      const context: AudioFileContext = {
        identifier: 'ctx-id',
        name: 'ctx.mp3',
        type: 'audio/mpeg',
        blob,
        url: '',
      };
      const audio = AudioFile.create(context);
      expect(audio.identifier).toBe('ctx-id');
      expect(audio.name).toBe('ctx.mp3');
      expect(audio.blob).toBe(blob);
    });

    it('makes an object url when there are bytes', () => {
      const blob = new Blob(['data'], { type: 'audio/mpeg' });
      const context: AudioFileContext = {
        identifier: 'ctx-id',
        name: 'ctx.mp3',
        type: 'audio/mpeg',
        blob,
        url: '',
      };
      AudioFile.create(context);
      expect(createObjectURLSpy).toHaveBeenCalledWith(blob);
    });
  });

  // ----------------------------------------------------------------
  // apply
  // ----------------------------------------------------------------
  describe('apply', () => {
    it('overwrites the identifier only while it is empty', () => {
      const audio = AudioFile.createEmpty('original-id');
      audio.apply({ identifier: 'new-id', name: '', type: '', blob: null, url: '' });
      expect(audio.identifier).toBe('original-id');
    });

    it('sets an empty identifier from the context', () => {
      const audio = AudioFile.createEmpty('');
      audio.apply({ identifier: 'set-id', name: '', type: '', blob: null, url: '' });
      expect(audio.identifier).toBe('set-id');
    });

    it('always overwrites the name', () => {
      const context: AudioFileContext = {
        identifier: 'id1',
        name: 'original.mp3',
        type: 'audio/mpeg',
        blob: null,
        url: 'https://example.com/sound.mp3',
      };
      const audio = AudioFile.create(context);
      audio.apply({ identifier: '', name: 'updated.mp3', type: '', blob: null, url: '' });
      expect(audio.name).toBe('updated.mp3');
    });

    it('overwrites the bytes only while there are none', () => {
      const originalBlob = new Blob(['original'], { type: 'audio/mpeg' });
      const newBlob = new Blob(['new'], { type: 'audio/mpeg' });
      const context: AudioFileContext = {
        identifier: 'id1',
        name: 'sound.mp3',
        type: 'audio/mpeg',
        blob: originalBlob,
        url: '',
      };
      const audio = AudioFile.create(context);
      audio.apply({ identifier: '', name: '', type: '', blob: newBlob, url: '' });
      expect(audio.blob).toBe(originalBlob);
    });

    it('overwrites the url only while it is empty', () => {
      const context: AudioFileContext = {
        identifier: 'id1',
        name: 'sound.mp3',
        type: 'audio/mpeg',
        blob: null,
        url: 'https://example.com/original.mp3',
      };
      const audio = AudioFile.create(context);
      audio.apply({ identifier: '', name: '', type: '', blob: null, url: 'https://example.com/new.mp3' });
      expect(audio.url).toBe('https://example.com/original.mp3');
    });

    it('overwrites the type only while it is empty', () => {
      const context: AudioFileContext = {
        identifier: 'id1',
        name: 'sound.mp3',
        type: 'audio/mpeg',
        blob: null,
        url: 'https://example.com/sound.mp3',
      };
      const audio = AudioFile.create(context);
      audio.apply({ identifier: '', name: '', type: 'audio/ogg', blob: null, url: '' });
      expect(audio.toContext().type).toBe('audio/mpeg');
    });

    it('leaves the artwork unread when the bytes that arrived cannot be read', async () => {
      vi.spyOn(FileReader.prototype, 'readAsArrayBuffer').mockImplementation(function (this: FileReader) {
        queueMicrotask(() => this.onerror?.call(this, new ProgressEvent('error') as ProgressEvent<FileReader>));
      });
      const audio = AudioFile.createEmpty('id1');
      const blob = new Blob(['data'], { type: 'audio/mpeg' });

      audio.apply({ identifier: '', name: '', type: 'audio/mpeg', blob, url: '' });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(audio.artworkUrl).toBeNull();
      expect((audio as unknown as { _artworkUrl: unknown })._artworkUrl).toBeUndefined();
    });

    it('makes a url when bytes arrive where there were none', () => {
      const audio = AudioFile.createEmpty('id1');
      const blob = new Blob(['data'], { type: 'audio/mpeg' });
      audio.apply({ identifier: '', name: 'sound.mp3', type: 'audio/mpeg', blob, url: '' });
      expect(createObjectURLSpy).toHaveBeenCalledWith(blob);
      expect(audio.url).toBe('blob:mock-url');
    });
  });

  // ----------------------------------------------------------------
  // toContext
  // ----------------------------------------------------------------
  describe('toContext', () => {
    it('returns its context', () => {
      const url = 'https://example.com/sound.mp3';
      const audio = AudioFile.create(url);
      const ctx = audio.toContext();
      expect(ctx.identifier).toBe(url);
      expect(ctx.url).toBe(url);
    });

    it('returns a context carrying the bytes and the type', () => {
      const blob = new Blob(['data'], { type: 'audio/mpeg' });
      const context: AudioFileContext = {
        identifier: 'id1',
        name: 'sound.mp3',
        type: 'audio/mpeg',
        blob,
        url: '',
      };
      const audio = AudioFile.create(context);
      const ctx = audio.toContext();
      expect(ctx.blob).toBe(blob);
      expect(ctx.type).toBe('audio/mpeg');
      expect(ctx.name).toBe('sound.mp3');
    });
  });

  // ----------------------------------------------------------------
  // createAsync
  // ----------------------------------------------------------------
  describe('createAsync', () => {
    it('builds a file from bytes', async () => {
      const blob = new Blob(['audio data'], { type: 'audio/mpeg' });
      const audio = await AudioFile.createAsync(blob);
      expect(audio).toBeTruthy();
      expect(audio.identifier).toBeTruthy();
      expect(audio.blob).toBeTruthy();
      expect(audio.state).toBe(AudioState.COMPLETE);
    });

    it('takes the name from a file', async () => {
      const file = new File(['audio data'], 'test.mp3', { type: 'audio/mpeg' });
      const audio = await AudioFile.createAsync(file);
      expect(audio.name).toBe('test.mp3');
    });

    it('names bytes with no name after their identifier', async () => {
      const blob = new Blob(['audio data'], { type: 'audio/mpeg' });
      const audio = await AudioFile.createAsync(blob);
      expect(audio.name).toBe(audio.identifier);
    });
  });

  // ----------------------------------------------------------------
  // destroy
  // ----------------------------------------------------------------
  describe('destroy', () => {
    it('releases the object url when there are bytes', async () => {
      const file = new File(['audio data'], 'test.mp3', { type: 'audio/mpeg' });
      const audio = await AudioFile.createAsync(file);
      audio.destroy();
      expect(revokeObjectURLSpy).toHaveBeenCalled();
    });

    it('releases nothing when there are none', () => {
      const audio = AudioFile.create('https://example.com/sound.mp3');
      audio.destroy();
      expect(revokeObjectURLSpy).not.toHaveBeenCalled();
    });
  });
});
