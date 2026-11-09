import { readdirSync, readFileSync } from 'node:fs';

/** The templates of the parts the canvas draws pieces from pictures of, read from the source. */
function picturedTemplates(): { path: string; html: string }[] {
  return readdirSync('src/app/features', { recursive: true, encoding: 'utf8' })
    .filter((path) => path.endsWith('.component.ts'))
    .map((path) => `src/app/features/${path}`)
    .filter((path) => readFileSync(path, 'utf8').includes('pictureForCanvas('))
    .map((path) => path.replace(/\.ts$/, '.html'))
    .map((path) => ({ path, html: readFileSync(path, 'utf8') }));
}

describe('the parts the canvas draws pieces from pictures of', () => {
  it('show the pictures they carry as images, never as backgrounds, which WebKit leaves out of a picture', () => {
    const templates = picturedTemplates();
    expect(templates.length).toBeGreaterThanOrEqual(8);

    for (const { path, html } of templates) {
      expect(html, path).not.toMatch(/\[style\.background(-image)?\]="[^"]*url\(/);
      expect(html, path).not.toMatch(/bg-\[url\(/);
      expect(html, path).not.toMatch(/background-image\s*:/);
    }
  });
});
