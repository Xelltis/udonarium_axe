import {
  ancestorFolderPaths,
  FOLDER_SEPARATOR,
  folderSegments,
  isDescendantFolderPath,
  MAX_FOLDER_DEPTH,
  normalizeFolderPath,
  parentFolderPath,
  readFolderPaths,
  rewriteFolderPath,
  writeFolderPaths,
} from '@axe/domain/folder/folder-path';

describe('normalizeFolderPath()', () => {
  it('leaves a plain name alone', () => {
    expect(normalizeFolderPath('第1話')).toBe('第1話');
  });

  it('keeps the levels of a nested path', () => {
    expect(normalizeFolderPath('第1話/洞窟')).toBe('第1話/洞窟');
  });

  it('trims the spaces around every level', () => {
    expect(normalizeFolderPath(' 第1話 / 洞窟 ')).toBe('第1話/洞窟');
  });

  it('closes up the gaps left by empty levels', () => {
    expect(normalizeFolderPath('第1話//洞窟')).toBe('第1話/洞窟');
  });

  it('drops a separator at either end', () => {
    expect(normalizeFolderPath('/第1話/洞窟/')).toBe('第1話/洞窟');
  });

  it('reads a full-width slash as a separator', () => {
    expect(normalizeFolderPath('第1話／洞窟')).toBe('第1話/洞窟');
  });

  it('leaves the rest of the name as it was typed', () => {
    expect(normalizeFolderPath('ＡＢＣ　の巻')).toBe('ＡＢＣ　の巻');
  });

  it('comes back empty from nothing but separators and spaces', () => {
    expect(normalizeFolderPath('  //  ')).toBe('');
  });

  it('cuts what runs deeper than the limit', () => {
    const deep = ['a', 'b', 'c', 'd', 'e', 'f'].join(FOLDER_SEPARATOR);
    expect(folderSegments(deep)).toHaveLength(MAX_FOLDER_DEPTH);
    expect(normalizeFolderPath(deep)).toBe('a/b/c/d');
  });
});

describe('parentFolderPath()', () => {
  it('drops the last level', () => {
    expect(parentFolderPath('第1話/洞窟')).toBe('第1話');
  });

  it('comes back empty at the top level', () => {
    expect(parentFolderPath('第1話')).toBe('');
  });

  it('comes back empty from no folder at all', () => {
    expect(parentFolderPath('')).toBe('');
  });
});

describe('ancestorFolderPaths()', () => {
  it('walks down from the top level to the path itself', () => {
    expect(ancestorFolderPaths('第1話/洞窟/最奥')).toEqual(['第1話', '第1話/洞窟', '第1話/洞窟/最奥']);
  });

  it('gives back nothing for no folder', () => {
    expect(ancestorFolderPaths('')).toEqual([]);
  });
});

describe('isDescendantFolderPath()', () => {
  it('counts a folder as its own', () => {
    expect(isDescendantFolderPath('第1話', '第1話')).toBe(true);
  });

  it('counts what sits inside it', () => {
    expect(isDescendantFolderPath('第1話/洞窟', '第1話')).toBe(true);
  });

  it('refuses a name that merely starts the same way', () => {
    expect(isDescendantFolderPath('第1話大全', '第1話')).toBe(false);
  });

  it('refuses a folder alongside it', () => {
    expect(isDescendantFolderPath('第2話/洞窟', '第1話')).toBe(false);
  });

  it('holds nothing beneath no folder at all', () => {
    expect(isDescendantFolderPath('第1話', '')).toBe(false);
  });
});

describe('rewriteFolderPath()', () => {
  it('renames the folder itself', () => {
    expect(rewriteFolderPath('第1話', '第1話', '序章')).toBe('序章');
  });

  it('carries what sits inside it along', () => {
    expect(rewriteFolderPath('第1話/洞窟', '第1話', '序章')).toBe('序章/洞窟');
  });

  it('leaves a name that merely starts the same way alone', () => {
    expect(rewriteFolderPath('第1話大全', '第1話', '序章')).toBe('第1話大全');
  });

  it('leaves a folder alongside it alone', () => {
    expect(rewriteFolderPath('第2話/洞窟', '第1話', '序章')).toBe('第2話/洞窟');
  });

  it('empties the whole subtree when it is renamed to nothing', () => {
    expect(rewriteFolderPath('第1話/洞窟', '第1話', '   ')).toBe('');
  });

  it('normalizes what it writes', () => {
    expect(rewriteFolderPath('第1話/洞窟', '第1話', ' 序章／導入 ')).toBe('序章/導入/洞窟');
  });
});

describe('folder paths kept as JSON', () => {
  it('reads none from nothing, or from what cannot be read', () => {
    for (const held of ['', undefined, null, 'not json', '{"a":1}', '"one"']) {
      expect(readFolderPaths(held)).toEqual([]);
    }
  });

  it('tidies each path as it is stored, leaving out the empty, the repeats and what is not a path', () => {
    expect(readFolderPaths('["第1話／村 ", "第1話/村", "", 3, "第2話"]')).toEqual(['第1話/村', '第2話']);
  });

  it('writes nothing for no folders, and reads back what it writes', () => {
    expect(writeFolderPaths([])).toBe('');
    expect(readFolderPaths(writeFolderPaths(['a/b', 'c']))).toEqual(['a/b', 'c']);
  });
});
