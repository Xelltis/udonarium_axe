import {
  buildConcealMenu,
  buildRevealMenu,
  listedThingLabel,
} from '@axe/features/tabletop/board-switch/concealment-context-menu';
import { createSyncTranslate } from '@axe/testing/transloco-testing';

const t = createSyncTranslate('ja');

describe('the menus for putting things out of sight', () => {
  it('offers the master alone to put something out of sight', () => {
    const conceal = vi.fn();

    expect(buildConcealMenu(false, conceal, t)).toEqual([]);
    const [entry] = buildConcealMenu(true, conceal, t);
    entry.action?.();

    expect(entry.name).toBe('伏せる（スイッチで見せる）');
    expect(conceal).toHaveBeenCalled();
  });

  it('lists what is out of sight for the master, and brings back what is chosen', () => {
    const reveal = vi.fn();
    const concealed = [{ label: '隠し扉（地形）', reveal }];

    expect(buildRevealMenu(false, concealed, t)).toEqual([]);
    expect(buildRevealMenu(true, [], t)).toEqual([]);
    const [menu] = buildRevealMenu(true, concealed, t);
    menu.subActions?.[0].action?.();

    expect(menu.name).toBe('伏せた物を見せる');
    expect(menu.subActions?.map((entry) => entry.name)).toEqual(['隠し扉（地形）']);
    expect(reveal).toHaveBeenCalled();
  });

  it('lists a thing by its name and its kind, in the brackets the language writes', () => {
    expect(listedThingLabel(' 隠し扉 ', '地形', t)).toBe('隠し扉（地形）');
    expect(listedThingLabel('', '地形', t)).toBe('名前なし（地形）');
    expect(listedThingLabel('Hidden door', 'Terrain', createSyncTranslate('en'))).toBe('Hidden door (Terrain)');
  });
});
