import { Renderer2, RendererFactory2, RendererType2 } from '@angular/core';

/**
 * The namespaces Angular names by a short word rather than by their address.
 *
 * The same list the framework's own renderer keeps. A namespace it does not know is passed
 * through as written, which is what an address already is.
 */
const NAMESPACES: Record<string, string> = {
  svg: 'http://www.w3.org/2000/svg',
  xhtml: 'http://www.w3.org/1999/xhtml',
  xlink: 'http://www.w3.org/1999/xlink',
  xml: 'http://www.w3.org/XML/1998/namespace',
  xmlns: 'http://www.w3.org/2000/xmlns/',
  math: 'http://www.w3.org/1998/Math/MathML',
};

/**
 * A renderer that makes its nodes with a document of its own, and does everything else as before.
 *
 * Angular makes every node with the document the application started in, wherever that node is
 * going. A node put into another window's document is taken over by it, which is enough for
 * anything the browser draws itself - a box, a button, a picture. It is not enough for the
 * parts the browser hands to the operating system: a `select` made by one document and moved
 * into another is a select whose list never opens, on the browsers that build that list when
 * the element is made rather than when it is shown.
 *
 * Only the making is changed. Everything after it - attributes, styles, listeners, the
 * component's own stylesheet - is the framework's, untouched.
 */
export function windowRenderer(base: Renderer2, document: Document): Renderer2 {
  return new Proxy(base, {
    get: (target, key) => {
      if (key === 'createElement') {
        return (name: string, namespace?: string | null) =>
          namespace ? document.createElementNS(NAMESPACES[namespace] ?? namespace, name) : document.createElement(name);
      }
      if (key === 'createComment') return (value: string) => document.createComment(value);
      if (key === 'createText') return (value: string) => document.createTextNode(value);
      const held: unknown = Reflect.get(target, key, target);
      return typeof held === 'function' ? held.bind(target) : held;
    },
    set: (target, key, value) => Reflect.set(target, key, value, target),
  });
}

/** The same, for whatever asks the application for a renderer while a window is being drawn. */
export function windowRendererFactory(base: RendererFactory2, document: Document): RendererFactory2 {
  return new Proxy(base, {
    get: (target, key) => {
      if (key === 'createRenderer') {
        return (host: unknown, type: RendererType2 | null) =>
          windowRenderer(target.createRenderer(host, type), document);
      }
      const held: unknown = Reflect.get(target, key, target);
      return typeof held === 'function' ? held.bind(target) : held;
    },
  });
}
