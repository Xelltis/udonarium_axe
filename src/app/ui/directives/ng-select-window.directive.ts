import { DOCUMENT } from '@angular/common';
import { Directive, ElementRef, inject } from '@angular/core';

/**
 * A document that is always the one the element stands in at the moment it is asked.
 *
 * An element is made in the document the app started in and can be put into another window's
 * afterwards, and a panel can be carried across and back while it is open. What reads the
 * document once and keeps it would go on answering for the window the element has left.
 */
function standingDocumentOf(element: Element): Document {
  const standing = () => element.ownerDocument;
  return new Proxy({} as Document, {
    get: (_, key) => {
      const document = standing();
      const value: unknown = Reflect.get(document, key, document);
      return typeof value === 'function' ? value.bind(document) : value;
    },
    set: (_, key, value) => Reflect.set(standing(), key, value),
    has: (_, key) => Reflect.has(standing(), key),
    getPrototypeOf: () => Reflect.getPrototypeOf(standing()),
  });
}

/**
 * Opens a select's list in the window the select is standing in.
 *
 * ng-select puts its list on the document it was given when it was made, listens there for a
 * click outside it, and measures there where the list fits. A select inside a panel taken out
 * into a window of its own would be given the main window's, and the list would open back where
 * the panel had been. Given the document it is standing in instead, every one of those follows
 * the select over, into whichever window it was opened in and whichever it was carried to.
 */
@Directive({
  selector: 'ng-select',
  providers: [{ provide: DOCUMENT, useFactory: () => standingDocumentOf(inject(ElementRef).nativeElement) }],
})
export class NgSelectWindowDirective {}
