import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { ChatFontService } from '@axe/application/chat/chat-font.service';
import { chatFontWanted$ } from '@axe/core/event/domain-events';

/** A page whose head is out of any document, so that the sheets put in it are never fetched. */
function detachedPage(): Document {
  return { head: document.createElement('head'), createElement: document.createElement.bind(document) } as never;
}

describe('ChatFontService', () => {
  let page: Document;

  beforeEach(() => {
    page = detachedPage();
    TestBed.configureTestingModule({ providers: [{ provide: DOCUMENT, useValue: page }] });
    TestBed.inject(ChatFontService);
  });

  function sheets(): string[] {
    return Array.from(page.head.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')).map((link) =>
      link.getAttribute('href')!
    );
  }

  it('puts in the sheet of a font the first time a line asks for it, and only then', () => {
    expect(sheets()).toEqual([]);

    chatFontWanted$.emit('mincho');
    chatFontWanted$.emit('mincho');

    expect(sheets()).toEqual(['assets/fonts/chat/shippori-mincho/400.css']);
  });

  it('passes over the tool’s own font and a name it does not know', () => {
    chatFontWanted$.emit('gothic');
    chatFontWanted$.emit('comic-sans');

    expect(sheets()).toEqual([]);
  });
});
