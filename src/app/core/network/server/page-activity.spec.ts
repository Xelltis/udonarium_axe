import { PageActivity } from '@axe/core/network/server/page-activity';

describe('PageActivity', () => {
  it('takes the page as used when it was opened', () => {
    expect(new PageActivity(() => 1000).lastInputAt).toBe(1000);
  });

  it('notes each use and tells whoever listens, until they stop', () => {
    let now = 1000;
    const activity = new PageActivity(() => now);
    const heard: number[] = [];
    const stop = activity.onInput((at) => heard.push(at));

    now = 2000;
    activity.noteInput();
    stop();
    now = 3000;
    activity.noteInput();

    expect(heard).toEqual([2000]);
    expect(activity.lastInputAt).toBe(3000);
  });

  it.each(['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'])(
    'hears a %s anywhere on the window once it watches',
    (type) => {
      let now = 1000;
      const activity = new PageActivity(() => now);
      activity.watch();
      activity.watch();
      const heard: number[] = [];
      activity.onInput((at) => heard.push(at));

      now = 5000;
      document.body.dispatchEvent(new Event(type, { bubbles: true }));

      expect(heard).toEqual([5000]);
    }
  );
});
