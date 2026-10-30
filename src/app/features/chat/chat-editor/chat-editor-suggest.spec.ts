import { keepInView } from '@axe/features/chat/chat-editor/chat-editor-suggest';

describe('keepInView', () => {
  it('scrolls down just far enough for an entry below what the list shows to be seen whole', () => {
    const list = { scrollTop: 0, clientHeight: 100 };
    keepInView(list, { offsetTop: 120, offsetHeight: 20 });
    expect(list.scrollTop).toBe(40);
  });

  it('scrolls up to an entry above what the list shows', () => {
    const list = { scrollTop: 80, clientHeight: 100 };
    keepInView(list, { offsetTop: 20, offsetHeight: 20 });
    expect(list.scrollTop).toBe(20);
  });

  it('leaves the list where it is for an entry already seen', () => {
    const list = { scrollTop: 40, clientHeight: 100 };
    keepInView(list, { offsetTop: 60, offsetHeight: 20 });
    expect(list.scrollTop).toBe(40);
  });
});
