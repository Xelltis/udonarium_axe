import { followPlainBox } from '@axe/ui/plain-box-handover';

describe('followPlainBox', () => {
  let box: HTMLTextAreaElement;
  let other: HTMLInputElement;

  beforeEach(() => {
    box = document.createElement('textarea');
    box.value = '今のは見逃せない';
    other = document.createElement('input');
    document.body.append(box, other);
  });

  afterEach(() => {
    box.remove();
    other.remove();
  });

  it('reads the caret as it stands when asked, not as it stood when followed', () => {
    box.focus();
    box.setSelectionRange(8, 8);
    const stand = followPlainBox(box);

    box.setSelectionRange(2, 2);

    expect(stand()).toEqual({ selection: { from: 2, to: 2 }, focused: true });
  });

  it('keeps the keys of a box taken off the page while it held them, with its caret', () => {
    box.focus();
    const stand = followPlainBox(box);
    box.setSelectionRange(3, 3);

    box.remove();

    expect(stand()).toEqual({ selection: { from: 3, to: 3 }, focused: true });
  });

  it('gives the keys to a box first pressed after it was followed', () => {
    const stand = followPlainBox(box);

    box.focus();
    box.remove();

    expect(stand().focused).toBe(true);
  });

  it('leaves the keys with another field the reader went to', () => {
    box.focus();
    const stand = followPlainBox(box);

    other.focus();

    expect(stand().focused).toBe(false);
  });

  it('gives no keys where the box never held them', () => {
    const stand = followPlainBox(box);

    box.remove();

    expect(stand().focused).toBe(false);
  });
});
