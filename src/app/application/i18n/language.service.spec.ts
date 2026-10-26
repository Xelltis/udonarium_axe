import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { LanguageService } from '@axe/application/i18n/language.service';
import { STORAGE_KEYS } from '@axe/core/storage/storage-keys';
import { beforeEach, describe, expect, it } from 'vitest';

describe('LanguageService', () => {
  let service: LanguageService;
  let html: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    localStorage.removeItem(STORAGE_KEYS.language);
    html = TestBed.inject(DOCUMENT).documentElement;
    html.removeAttribute('lang');
    service = TestBed.inject(LanguageService);
  });

  it('marks the document with the language it starts in', async () => {
    localStorage.setItem(STORAGE_KEYS.language, 'en');

    await service.initialize();

    expect(html.lang).toBe('en');
    expect(service.currentLang()).toBe('en');
  });

  it('follows the language the user switches to', async () => {
    localStorage.setItem(STORAGE_KEYS.language, 'ja');
    await service.initialize();

    await service.setLang('en');
    expect(html.lang).toBe('en');

    await service.setLang('ja');
    expect(html.lang).toBe('ja');
  });

  it('follows a toggle', async () => {
    localStorage.setItem(STORAGE_KEYS.language, 'ja');
    await service.initialize();

    await service.toggle();

    expect(html.lang).toBe('en');
    expect(service.currentLang()).toBe('en');
  });

  it('comes back round to the first language it offers', async () => {
    localStorage.setItem(STORAGE_KEYS.language, 'ja');
    await service.initialize();

    const seen: string[] = [];
    for (let step = 0; step < service.availableLangs().length; step++) {
      await service.toggle();
      seen.push(service.currentLang());
    }

    expect(seen).toEqual(['en', 'ko', 'ja']);
  });

  it('serves Korean to a Korean browser', async () => {
    await service.setLang('ko');

    expect(service.currentLang()).toBe('ko');
    expect(html.lang).toBe('ko');
  });
});
