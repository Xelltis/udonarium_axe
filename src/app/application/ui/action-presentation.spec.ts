import { actionPresentationOf } from '@axe/application/ui/action-presentation';

describe('actionPresentationOf()', () => {
  it('reads a ticked and an empty box', () => {
    expect(actionPresentationOf('☑ 名前を表示')).toEqual({
      label: '名前を表示',
      kind: 'checkbox',
      checked: true,
      icon: 'check_box',
    });
    expect(actionPresentationOf('☐ 外周表示')).toEqual({
      label: '外周表示',
      kind: 'checkbox',
      checked: false,
      icon: 'check_box_outline_blank',
    });
  });

  it('reads a chosen and an unchosen radio button', () => {
    expect(actionPresentationOf('◉ 高速')).toEqual({
      label: '高速',
      kind: 'radio',
      checked: true,
      icon: 'radio_button_checked',
    });
    expect(actionPresentationOf('○ 低速')).toEqual({
      label: '低速',
      kind: 'radio',
      checked: false,
      icon: 'radio_button_unchecked',
    });
  });

  it('reads a plain tick as a chosen row', () => {
    expect(actionPresentationOf('✔ 選択中')).toEqual({
      label: '選択中',
      kind: 'selected',
      checked: true,
      icon: 'check',
    });
  });

  it('leaves a name without a mark as it is, and takes only the space after a mark', () => {
    expect(actionPresentationOf('通常項目')).toEqual({ label: '通常項目', kind: 'none', checked: null, icon: null });
    expect(actionPresentationOf('☑名前').label).toBe('名前');
    expect(actionPresentationOf('名前 ☑').label).toBe('名前 ☑');
  });
});
