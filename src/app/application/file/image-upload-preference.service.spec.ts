import { TestBed } from '@angular/core/testing';
import { ImageUploadPreferenceService } from '@axe/application/file/image-upload-preference.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('ImageUploadPreferenceService', () => {
  const key = 'ui-image-edit-first';

  function fresh(): ImageUploadPreferenceService {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    return TestBed.inject(ImageUploadPreferenceService);
  }

  afterEach(() => {
    localStorage.removeItem(key);
    vi.restoreAllMocks();
  });

  it('adds pictures as they are unless asked otherwise', () => {
    expect(fresh().editFirst()).toBe(false);
  });

  it('remembers in this browser that pictures open in the editor first', () => {
    fresh().setEditFirst(true);

    expect(localStorage.getItem(key)).toBe('true');
    TestBed.resetTestingModule();
    expect(fresh().editFirst()).toBe(true);
  });

  it('reads anything but the word for yes as no', () => {
    localStorage.setItem(key, '1');

    expect(fresh().editFirst()).toBe(false);
  });

  it('still holds the choice for the session where the browser will not write it down', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    const preference = fresh();

    preference.setEditFirst(true);

    expect(preference.editFirst()).toBe(true);
  });
});
