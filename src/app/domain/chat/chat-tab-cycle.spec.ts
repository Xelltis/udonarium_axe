import { ChatTab } from '@axe/domain/chat/chat-tab';
import { tabBeside } from '@axe/domain/chat/chat-tab-cycle';

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
