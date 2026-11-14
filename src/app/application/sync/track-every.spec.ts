import { computed } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { trackEvery } from '@axe/application/sync/track-every';
import { ObjectStore } from '@axe/core/sync/object-store';
import { AudioTag } from '@axe/domain/media/audio-tag';

describe('trackEvery', () => {
  let service: ObjectChangeService;

  beforeEach(() => {
    service = TestBed.inject(ObjectChangeService);
  });

  afterEach(() => {
    for (const tag of ObjectStore.instance.getObjects(AudioTag)) tag.destroy();
  });

  function tagsSeen(): () => string[] {
    return TestBed.runInInjectionContext(() =>
      computed(() => {
        trackEvery(service, AudioTag.aliasName);
        return ObjectStore.instance.getObjects<AudioTag>(AudioTag).map((tag) => tag.tag);
      })
    );
  }

  it('hears a field written on one of them', () => {
    const tag = AudioTag.create('sound-1');
    const tags = tagsSeen();
    expect(tags()).toEqual(['BGM']);

    tag.tag = 'SE';
    service.notifyChanged(tag.identifier);

    expect(tags()).toEqual(['SE']);
  });

  it('hears one that arrives after it was first asked, and a field written on it', () => {
    const tags = tagsSeen();
    expect(tags()).toEqual([]);

    const tag = AudioTag.create('sound-1');
    service.notifyCollectionChanged(AudioTag.aliasName);
    expect(tags()).toEqual(['BGM']);

    tag.tag = 'SE';
    service.notifyChanged(tag.identifier);
    expect(tags()).toEqual(['SE']);
  });
});
