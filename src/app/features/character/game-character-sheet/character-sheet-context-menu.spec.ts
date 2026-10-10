import { ContextMenuType } from '@axe/application/ui/context-menu.service';
import { buildCharacterSheetMenu } from '@axe/features/character/game-character-sheet/character-sheet-context-menu';

const t = (key: string) => `t:${key}`;
const names = (menu: ReturnType<typeof buildCharacterSheetMenu>) =>
  menu.map((entry) => (entry.type === ContextMenuType.SEPARATOR ? '---' : entry.name));

describe('buildCharacterSheetMenu', () => {
  const all = {
    copy: () => {},
    save: () => {},
    portraits: () => {},
    collapseAll: () => {},
    expandAll: () => {},
  };

  it('offers the portraits, a copy and saving, then folding, set apart', () => {
    expect(names(buildCharacterSheetMenu(all, t))).toEqual([
      't:feature.inventory.sheet.portraitsManage',
      't:feature.inventory.sheet.copy',
      't:feature.inventory.sheet.save',
      '---',
      't:feature.inventory.sheet.collapseAll',
      't:feature.inventory.sheet.expandAll',
    ]);
  });

  it('leaves out what it is not given, with no separator left hanging', () => {
    expect(names(buildCharacterSheetMenu({ copy: all.copy, save: all.save }, t))).toEqual([
      't:feature.inventory.sheet.copy',
      't:feature.inventory.sheet.save',
    ]);
  });

  it('runs the action a row stands for', () => {
    const save = vi.fn();
    const menu = buildCharacterSheetMenu({ save }, t);

    menu[0].action!();

    expect(save).toHaveBeenCalledTimes(1);
  });
});
