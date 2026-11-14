import { ChatTab } from '@axe/domain/chat/chat-tab';
import { keptTabOf, tabBeside, tabToShow } from '@axe/domain/chat/chat-tab-cycle';

describe('tabBeside()', () => {
  const tab = (identifier: string) => ({ identifier }) as ChatTab;
  const tabs = [tab('main'), tab('sub'), tab('system')];

  it('steps either way along the tabs, wrapping round at either end', () => {
    expect(tabBeside(tabs, 'main', 1)?.identifier).toBe('sub');
    expect(tabBeside(tabs, 'system', 1)?.identifier).toBe('main');
    expect(tabBeside(tabs, 'main', -1)?.identifier).toBe('system');
  });

  it('answers null where the current tab is not among them', () => {
    expect(tabBeside(tabs, 'gone', 1)).toBeNull();
    expect(tabBeside([], 'main', 1)).toBeNull();
  });
});

describe('tabToShow()', () => {
  const tab = (identifier: string) => ({ identifier, isSystemTab: identifier === 'SystemTab' }) as ChatTab;
  const system = tab('SystemTab');

  it('keeps the tab shown while it is in view, and falls to the first tab to talk in, past the system tab', () => {
    expect(tabToShow([tab('main'), tab('sub'), system], 'sub', '')).toBe('sub');
    expect(tabToShow([system, tab('talk')], 'gone', '')).toBe('talk');
    expect(tabToShow([system], 'gone', '')).toBe('SystemTab');
    expect(tabToShow([], 'gone', '')).toBe('');
  });

  it('goes back to the tab it lost once that is back, and leaves the system tab it fell on for a tab to talk in', () => {
    expect(tabToShow([system, tab('main')], 'SystemTab', 'main')).toBe('main');
    expect(tabToShow([system, tab('room-tab')], 'SystemTab', 'main')).toBe('room-tab');
    expect(tabToShow([system], 'SystemTab', 'main')).toBe('SystemTab');
  });

  it('keeps the system tab the reader chose, with no tab lost', () => {
    expect(tabToShow([tab('main'), system], 'SystemTab', '')).toBe('SystemTab');
  });
});

describe('keptTabOf()', () => {
  const tab = (identifier: string) => ({ identifier, isSystemTab: identifier === 'SystemTab' }) as ChatTab;
  const system = tab('SystemTab');

  it('stays on the tab shown while it is in view, with nothing remembered', () => {
    expect(keptTabOf([tab('main'), tab('sub')], 'sub', '')).toEqual({ tab: 'sub', lost: '' });
  });

  it('moves off a tab gone out of view and remembers it', () => {
    expect(keptTabOf([system, tab('sub')], 'main', '')).toEqual({ tab: 'sub', lost: 'main' });
    expect(keptTabOf([system], 'main', '')).toEqual({ tab: 'SystemTab', lost: 'main' });
  });

  it('goes back to the tab it lost once that is back, and forgets it', () => {
    expect(keptTabOf([system, tab('main')], 'SystemTab', 'main')).toEqual({ tab: 'main', lost: '' });
  });

  it('keeps the first tab lost while it moves on from another', () => {
    expect(keptTabOf([system], 'sub', 'main')).toEqual({ tab: 'SystemTab', lost: 'main' });
  });

  it('remembers nothing where no tab was shown', () => {
    expect(keptTabOf([tab('main')], '', '')).toEqual({ tab: 'main', lost: '' });
    expect(keptTabOf([], '', '')).toEqual({ tab: '', lost: '' });
  });
});
