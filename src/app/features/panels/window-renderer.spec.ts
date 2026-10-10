import { Renderer2, RendererFactory2 } from '@angular/core';
import { windowRenderer, windowRendererFactory } from '@axe/features/panels/window-renderer';
import { vi } from 'vitest';

/** A second document, standing for the one a window of its own brings with it. */
function otherDocument(): Document {
  return globalThis.document.implementation.createHTMLDocument('elsewhere');
}

/** The framework's own renderer, as far as this cares: it makes its nodes with the main document. */
function mainRenderer(): Renderer2 {
  const main = globalThis.document;
  return {
    data: {},
    destroy: () => undefined,
    destroyNode: null,
    createElement: (name: string, namespace?: string | null) =>
      namespace ? main.createElementNS(namespace, name) : main.createElement(name),
    createComment: (value: string) => main.createComment(value),
    createText: (value: string) => main.createTextNode(value),
    appendChild: (parent: Node, child: Node) => parent.appendChild(child),
    setAttribute: (element: Element, name: string, value: string) => element.setAttribute(name, value),
  } as unknown as Renderer2;
}

describe('drawing a panel in a window of its own', () => {
  it('makes an element with the window’s document rather than the app’s', () => {
    const elsewhere = otherDocument();

    const element = windowRenderer(mainRenderer(), elsewhere).createElement('select') as Element;

    expect(element.ownerDocument).toBe(elsewhere);
    expect(element.tagName.toLowerCase()).toBe('select');
  });

  it('asks that same document for its text and its comments', () => {
    // Asked of the document rather than read off the node: the test DOM files a text node made
    // by a second document under the first one, which a browser does not.
    const elsewhere = otherDocument();
    const text = vi.spyOn(elsewhere, 'createTextNode');
    const comment = vi.spyOn(elsewhere, 'createComment');
    const renderer = windowRenderer(mainRenderer(), elsewhere);

    renderer.createText('x');
    renderer.createComment('y');

    expect(text).toHaveBeenCalledWith('x');
    expect(comment).toHaveBeenCalledWith('y');
  });

  it('knows a namespace by the short word the framework names it with', () => {
    const elsewhere = otherDocument();

    const element = windowRenderer(mainRenderer(), elsewhere).createElement('path', 'svg') as Element;

    expect(element.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(element.ownerDocument).toBe(elsewhere);
  });

  it('leaves everything but the making to the renderer it was given', () => {
    const elsewhere = otherDocument();
    const renderer = windowRenderer(mainRenderer(), elsewhere);
    const element = renderer.createElement('div') as Element;

    renderer.setAttribute(element, 'data-held', 'yes');

    expect(element.getAttribute('data-held')).toBe('yes');
  });

  it('hands every renderer the application asks for the same document', () => {
    const elsewhere = otherDocument();
    const base = { createRenderer: () => mainRenderer() } as unknown as RendererFactory2;

    const made = windowRendererFactory(base, elsewhere).createRenderer(null, null).createElement('select') as Element;

    expect(made.ownerDocument).toBe(elsewhere);
  });
});
