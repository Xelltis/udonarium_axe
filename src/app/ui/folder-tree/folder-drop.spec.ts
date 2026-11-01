import { folderPathFromElement } from '@axe/ui/folder-tree/folder-drop';

function heading(path: string | null): Element {
  const element = document.createElement('div');
  element.setAttribute('data-folder-dropzone', '');
  if (path !== null) element.setAttribute('data-folder-path', path);
  return element;
}

function area(path: string): Element {
  const element = document.createElement('div');
  element.setAttribute('data-folder-area', '');
  element.setAttribute('data-folder-path', path);
  return element;
}

describe('folderPathFromElement()', () => {
  it('finds nothing under nothing', () => {
    expect(folderPathFromElement(null)).toBeNull();
  });

  it('finds nothing on what is not a place to drop', () => {
    expect(folderPathFromElement(document.createElement('div'))).toBeNull();
  });

  it('reads the folder off the heading', () => {
    expect(folderPathFromElement(heading('第1話/洞窟'))).toBe('第1話/洞窟');
  });

  it('reads no folder rather than nothing off the unfiled heading', () => {
    expect(folderPathFromElement(heading(''))).toBe('');
  });

  it('reads no folder off a heading that names none', () => {
    expect(folderPathFromElement(heading(null))).toBe('');
  });

  it('looks up from whatever inside the heading was under the pointer', () => {
    const outer = heading('第1話');
    const inner = document.createElement('span');
    outer.append(inner);

    expect(folderPathFromElement(inner)).toBe('第1話');
  });

  it('reads the folder off whatever lies open beneath its heading', () => {
    const folder = area('第1話');
    const row = document.createElement('div');
    folder.append(heading('第1話'), row);

    expect(folderPathFromElement(row)).toBe('第1話');
  });

  it('reads the nearer folder where one lies inside another', () => {
    const outer = area('第1話');
    const inner = area('第1話/洞窟');
    const row = document.createElement('div');
    outer.append(inner);
    inner.append(row);

    expect(folderPathFromElement(row)).toBe('第1話/洞窟');
  });
});
