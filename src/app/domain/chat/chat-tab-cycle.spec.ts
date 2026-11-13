import { ChatTab } from '@axe/domain/chat/chat-tab';
import { tabBeside, tabToShow } from '@axe/domain/chat/chat-tab-cycle';

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
