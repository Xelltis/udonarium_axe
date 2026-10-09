import { withoutExtension } from '@axe/core/util/file-name';

describe('a file name without its extension', () => {
  it('takes off the last extension and nothing before it', () => {
    expect(withoutExtension('cat.png')).toBe('cat');
    expect(withoutExtension('cat.final.webp')).toBe('cat.final');
  });

  it('leaves a name without an extension, and a dot that belongs to a folder, as they are', () => {
    expect(withoutExtension('README')).toBe('README');
    expect(withoutExtension('v1.2/cat')).toBe('v1.2/cat');
    expect(withoutExtension('v1.2\\cat')).toBe('v1.2\\cat');
  });
});
