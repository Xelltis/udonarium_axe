/** How many times finer than the page lays it out an element is pictured. */
const DETAIL = 2;

/** The faces the page draws text with from its own fonts rather than the system's. */
const OWN_FONTS = ['Material Icons'];

/** The fonts the page draws with, each as the rule that names it, read once. */
const fontRules = new Map<string, Promise<string>>();

/** Reads a resource the page holds into a data url, which a picture drawn from markup may load. */
async function dataUrlOf(url: string): Promise<string | null> {
  try {
    const blob = await (await fetch(url)).blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** The rule that brings in one of the page's own fonts, with the font held in it, or nothing. */
function fontRuleOf(family: string): Promise<string> {
  let rule = fontRules.get(family);
  if (!rule) {
    rule = (async () => {
      for (const sheet of Array.from(document.styleSheets)) {
        let rules: CSSRuleList;
        try {
          rules = sheet.cssRules;
        } catch {
          continue;
        }
        for (const face of Array.from(rules)) {
          if (!(face instanceof CSSFontFaceRule)) continue;
          if (face.style.getPropertyValue('font-family').replace(/["']/g, '') !== family) continue;
          const source = /url\(["']?([^"')]+)["']?\)/.exec(face.style.getPropertyValue('src'));
          if (!source) continue;
          const data = await dataUrlOf(new URL(source[1], sheet.href ?? location.href).href);
          if (data) return `@font-face{font-family:'${family}';src:url(${data})}`;
        }
      }
      return '';
    })();
    fontRules.set(family, rule);
  }
  return rule;
}

/**
 * Copies an element and everything in it with every style the page gives each written on it, so
 * the copy looks the same where no style sheet reaches. The pictures it shows are carried in it.
 */
async function styledCopyOf(element: Element, families: Set<string>): Promise<Element> {
  const copy = element.cloneNode(false) as Element;
  if (copy instanceof HTMLElement || copy instanceof SVGElement) {
    const style = getComputedStyle(element);
    const written: string[] = [];
    for (let i = 0; i < style.length; i++) {
      const name = style[i];
      written.push(`${name}:${style.getPropertyValue(name)}`);
    }
    copy.setAttribute('style', written.join(';'));
    for (const family of OWN_FONTS) if (style.fontFamily.includes(family)) families.add(family);
    const background = /url\(["']?(blob:[^"')]+)["']?\)/.exec(style.backgroundImage);
    if (background) {
      const data = await dataUrlOf(background[1]);
      if (data) (copy as HTMLElement).style.backgroundImage = `url(${data})`;
    }
  }
  if (copy instanceof HTMLImageElement && copy.src.startsWith('blob:')) {
    const data = await dataUrlOf(copy.src);
    if (data) copy.src = data;
  }
  for (const child of Array.from(element.childNodes)) {
    if (child instanceof Element) copy.appendChild(await styledCopyOf(child, families));
    else if (child.nodeType === Node.TEXT_NODE) copy.appendChild(child.cloneNode());
  }
  return copy;
}

/**
 * A picture of an element as the page lays it out, flat and as big as its own box, drawn finer
 * than the page draws it. The element is drawn as it would be with nothing turning or hiding it:
 * its own transform and clearness are left out, and it does not scroll. Null where it cannot be
 * drawn, as for an element with no size.
 */
export async function pictureOfElement(element: HTMLElement): Promise<Blob | null> {
  const width = element.offsetWidth;
  const height = element.offsetHeight;
  if (!(width > 0 && height > 0)) return null;
  const families = new Set<string>();
  const copy = (await styledCopyOf(element, families)) as HTMLElement;
  copy.style.transform = 'none';
  copy.style.opacity = '1';
  copy.style.position = 'static';
  copy.style.margin = '0';
  copy.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  const fonts = (await Promise.all([...families].map(fontRuleOf))).join('');
  const markup =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width * DETAIL}" height="${height * DETAIL}" ` +
    `viewBox="0 0 ${width} ${height}"><foreignObject width="${width}" height="${height}">` +
    (fonts ? `<style xmlns="http://www.w3.org/1999/xhtml">${fonts}</style>` : '') +
    new XMLSerializer().serializeToString(copy) +
    `</foreignObject></svg>`;
  const picture = new Image();
  picture.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  try {
    await picture.decode();
  } catch {
    return null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = width * DETAIL;
  canvas.height = height * DETAIL;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.drawImage(picture, 0, 0, canvas.width, canvas.height);
  try {
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve));
  } catch {
    return null;
  }
}
