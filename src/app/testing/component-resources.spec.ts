import { ComponentResources } from '@axe/testing/component-resources';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('ComponentResources', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'axe-component-resources-'));
    mkdirSync(join(root, 'one'));
    mkdirSync(join(root, 'two'));
    writeFileSync(join(root, 'one', 'only.component.html'), '<p>only</p>');
    writeFileSync(join(root, 'one', 'twice.component.html'), '<p>one</p>');
    writeFileSync(join(root, 'two', 'twice.component.html'), '<p>two</p>');
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('reads the file a relative address names', () => {
    expect(new ComponentResources(root).read('./only.component.html')).toBe('<p>only</p>');
  });

  it('refuses a name no file carries rather than answering with an empty template', () => {
    expect(() => new ComponentResources(root).read('./missing.component.html')).toThrow(/No file/);
  });

  it('refuses a name carried by files in two folders rather than picking one', () => {
    expect(() => new ComponentResources(root).read('./twice.component.html')).toThrow(/could be any of/);
  });
});
