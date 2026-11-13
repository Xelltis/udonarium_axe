import { TestBed } from '@angular/core/testing';
import { ObjectStore } from '@axe/core/sync/object-store';
import { AudioTag } from '@axe/domain/media/audio-tag';

describe('AudioTag', () => {
  let store: ObjectStore;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    store = ObjectStore.instance;
  });

  describe('create()', () => {
    it('is created against an audio identifier', () => {
      const tag = AudioTag.create('aud001');
      expect(tag).toBeTruthy();
      expect(tag.audioIdentifier).toBe('aud001');
    });

    it('carries the audio tag prefix in its identifier', () => {
      const tag = AudioTag.create('aud001');
      expect(tag.identifier).toBe('audiotag_aud001');
    });

    it('is added to the store', () => {
      const tag = AudioTag.create('aud001');
      expect(store.get(tag.identifier)).toBe(tag);
    });
  });

  describe('get()', () => {
    it('looks a tag up by its audio identifier', () => {
      AudioTag.create('aud001');
      const found = AudioTag.get('aud001');
      expect(found).toBeTruthy();
      expect(found!.audioIdentifier).toBe('aud001');
    });

    it('returns nothing for an identifier that is not there', () => {
      expect(AudioTag.get('nonexistent')).toBeFalsy();
    });
  });

  describe('SyncVar', () => {
    it('calls an untagged track music', () => {
      const tag = AudioTag.create('aud001');
      expect(tag.tag).toBe('BGM');
    });

    it('takes a tag', () => {
      const tag = AudioTag.create('aud001');
      tag.tag = 'SE';
      expect(tag.tag).toBe('SE');
    });
  });

  describe('containsWords()', () => {
    it('is true when every word is there', () => {
      const tag = AudioTag.create('aud001');
      tag.tag = 'BGM 戦闘';
      expect(tag.containsWords(['BGM', '戦闘'])).toBe(true);
    });

    it('is false when one is missing', () => {
      const tag = AudioTag.create('aud001');
      tag.tag = 'BGM 戦闘';
      expect(tag.containsWords(['BGM', '街'])).toBe(false);
    });

    it('is true for no words at all', () => {
      const tag = AudioTag.create('aud001');
      tag.tag = 'anything';
      expect(tag.containsWords([])).toBe(true);
    });
  });
});
