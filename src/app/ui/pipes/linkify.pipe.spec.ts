import { LinkifyPipe } from '@axe/ui/pipes/linkify.pipe';
import { loadLinkify } from '@axe/ui/text-decoration/linkify-loader';

describe('LinkifyPipe', () => {
  beforeAll(() => loadLinkify());

  let pipe: LinkifyPipe;

  beforeEach(() => {
    pipe = new LinkifyPipe();
  });

  it('can be created', () => {
    expect(pipe).toBeTruthy();
  });

  it('returns ordinary text unchanged', () => {
    expect(pipe.transform('ただのテキスト')).toBe('ただのテキスト');
  });

  it('turns a url into a link', () => {
    const result = pipe.transform('https://example.com にアクセス');
    expect(result).toContain('<a');
    expect(result).toContain('https://example.com');
    expect(result).toContain('</a>');
  });

  it('opens links in another tab with target="_blank"', () => {
    const result = pipe.transform('https://example.com');
    expect(result).toContain('target="_blank"');
    expect(result).toContain('rel="noopener noreferrer"');
  });

  it('turns several urls into links', () => {
    const result = pipe.transform('https://a.com と https://b.com');
    expect(result).toContain('https://a.com');
    expect(result).toContain('https://b.com');
    const linkCount = (result.match(/<a /g) ?? []).length;
    expect(linkCount).toBe(2);
  });

  it('turns null into an empty string', () => {
    expect(pipe.transform(null)).toBe('');
  });

  it('turns undefined into an empty string', () => {
    expect(pipe.transform(undefined)).toBe('');
  });

  it('accepts a number as text', () => {
    const result = pipe.transform(12345);
    expect(result).toBe('12345');
  });

  it('turns an email address into a link', () => {
    const result = pipe.transform('test@example.com');
    expect(result).toContain('<a');
    expect(result).toContain('test@example.com');
  });
});
