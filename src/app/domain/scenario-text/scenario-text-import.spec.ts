import { splitScenarioTexts } from '@axe/domain/scenario-text/scenario-text-import';

describe('splitting pasted writing into scenario texts', () => {
  it('makes a text of each heading and the words under it, the blank lines round them left out', () => {
    const pasted = [
      '# 導入',
      '',
      '雨が降っている。',
      '',
      '## 屋敷',
      '扉が**軋む**。',
      '',
      '',
      '■ 真相',
      '犯人は執事。',
    ].join('\n');

    expect(splitScenarioTexts(pasted)).toEqual([
      { title: '導入', text: '雨が降っている。' },
      { title: '屋敷', text: '扉が**軋む**。' },
      { title: '真相', text: '犯人は執事。' },
    ]);
  });

  it('keeps writing before the first heading as a text with no title, and a heading with nothing under it', () => {
    expect(splitScenarioTexts('前書き\n#見出しだけ\r\n')).toEqual([
      { title: '', text: '前書き' },
      { title: '見出しだけ', text: '' },
    ]);
  });

  it('makes one text of writing with no heading, and none of nothing', () => {
    expect(splitScenarioTexts('一行目\n二行目')).toEqual([{ title: '', text: '一行目\n二行目' }]);
    expect(splitScenarioTexts('\n  \n')).toEqual([]);
  });

  it('reads a # inside a line as words, not a heading', () => {
    expect(splitScenarioTexts('# 判定\n目星 #2 を振る')).toEqual([{ title: '判定', text: '目星 #2 を振る' }]);
  });
});
