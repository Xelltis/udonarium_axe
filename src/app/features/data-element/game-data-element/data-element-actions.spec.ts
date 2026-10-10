import { ContextMenuType } from '@axe/application/ui/context-menu.service';
import {
  buildContainerActions,
  buildFieldActions,
  buildMoveActions,
  type ContainerActionContext,
  type DataElementAction,
  type FieldActionContext,
  toContextMenuActions,
} from '@axe/features/data-element/game-data-element/data-element-actions';

const field = (overrides: Partial<FieldActionContext> = {}): FieldActionContext => ({
  isPopup: false,
  hasFieldOptions: true,
  fieldOptionsOpen: false,
  canAddSibling: true,
  canDuplicate: true,
  ...overrides,
});

const container = (overrides: Partial<ContainerActionContext> = {}): ContainerActionContext => ({
  isImage: false,
  isPopup: false,
  canToggleTableView: true,
  isTableView: false,
  hasTableSettings: false,
  settingsOpen: false,
  canDuplicate: true,
  canSaveTemplate: true,
  canAddGroup: true,
  hasTemplates: true,
  templateMenuOpen: false,
  canAddField: true,
  ...overrides,
});

const ids = (actions: DataElementAction[]) => actions.map((action) => action.id);
const inlineIds = (actions: DataElementAction[]) => ids(actions.filter((action) => action.inline));

describe('buildFieldActions', () => {
  it('lines up the bar of a field the way a wide sheet shows it', () => {
    expect(inlineIds(buildFieldActions(field()))).toEqual([
      'copyReference',
      'togglePopup',
      'fieldOptions',
      'addSibling',
      'delete',
    ]);
  });

  it('keeps the settings slot as a placeholder on a field without settings', () => {
    const settings = buildFieldActions(field({ hasFieldOptions: false })).find((a) => a.id === 'fieldOptions');
    expect(settings?.placeholder).toBe(true);
  });

  it('offers the settings on a field that has them', () => {
    const settings = buildFieldActions(field()).find((a) => a.id === 'fieldOptions');
    expect(settings?.placeholder).toBeUndefined();
  });

  it('leaves out adding a row where the parent takes no field', () => {
    expect(ids(buildFieldActions(field({ canAddSibling: false })))).not.toContain('addSibling');
  });

  it('keeps the copy out of the bar, for the editor alone', () => {
    const duplicate = buildFieldActions(field()).find((a) => a.id === 'duplicate');
    expect(duplicate?.inline).toBe(false);
  });

  it('marks the popup and the settings as pressed while they are on', () => {
    const actions = buildFieldActions(field({ isPopup: true, fieldOptionsOpen: true }));
    expect(actions.filter((a) => a.pressed).map((a) => a.id)).toEqual(['togglePopup', 'fieldOptions']);
  });

  it('sets the delete apart as the last, destroying action', () => {
    const actions = buildFieldActions(field());
    expect(actions.at(-1)).toMatchObject({
      id: 'delete',
      tone: 'danger',
      labelKey: 'feature.dataElement.action.deleteRow',
    });
  });
});

describe('buildContainerActions', () => {
  it('lines up the bar of a group the way a wide sheet shows it', () => {
    expect(inlineIds(buildContainerActions(container()))).toEqual([
      'tableView',
      'togglePopup',
      'duplicate',
      'saveTemplate',
      'addGroup',
      'addFromTemplate',
      'addField',
      'delete',
    ]);
  });

  it('offers the table settings beside the switch while the group is a table', () => {
    const actions = buildContainerActions(container({ isTableView: true, hasTableSettings: true }));
    expect(ids(actions).slice(0, 2)).toEqual(['tableView', 'tableSettings']);
    expect(actions[0].labelKey).toBe('feature.dataElement.action.normalView');
  });

  it('offers only adding a picture in an image list', () => {
    expect(ids(buildContainerActions(container({ isImage: true })))).toEqual([
      'tableView',
      'togglePopup',
      'duplicate',
      'saveTemplate',
      'addImage',
      'delete',
    ]);
  });

  it('leaves out the template menu when no template is saved', () => {
    expect(ids(buildContainerActions(container({ hasTemplates: false })))).not.toContain('addFromTemplate');
  });

  it('labels its delete as the section going', () => {
    expect(buildContainerActions(container()).at(-1)?.labelKey).toBe('feature.dataElement.action.deleteSection');
  });
});

describe('buildMoveActions', () => {
  it('offers every move from the middle of a long list', () => {
    expect(ids(buildMoveActions({ index: 2, count: 5, hasMoveTargets: true }))).toEqual([
      'moveToTop',
      'moveUp',
      'moveDown',
      'moveToBottom',
      'moveTo',
    ]);
  });

  it('offers nothing upward from the top', () => {
    expect(ids(buildMoveActions({ index: 0, count: 3, hasMoveTargets: false }))).toEqual(['moveDown', 'moveToBottom']);
  });

  it('leaves out the ends when they are only one place away', () => {
    expect(ids(buildMoveActions({ index: 1, count: 3, hasMoveTargets: false }))).toEqual(['moveUp', 'moveDown']);
  });

  it('offers nothing for an element alone with nowhere to go', () => {
    expect(buildMoveActions({ index: 0, count: 1, hasMoveTargets: false })).toEqual([]);
  });
});

describe('toContextMenuActions', () => {
  const t = (key: string) => `t:${key}`;

  it('puts the moves first and the delete last, each set apart', () => {
    const actions = [
      ...buildFieldActions(field({ hasFieldOptions: false })),
      ...buildMoveActions({ index: 1, count: 3, hasMoveTargets: false }),
    ];
    const menu = toContextMenuActions(actions, () => {}, t);
    expect(menu.map((entry) => (entry.type === ContextMenuType.SEPARATOR ? '---' : entry.name))).toEqual([
      't:common.reorder.up',
      't:common.reorder.down',
      '---',
      't:feature.dataElement.action.copyReference',
      't:feature.dataElement.action.popupShow',
      't:feature.dataElement.action.addRow',
      't:feature.dataElement.action.duplicate',
      '---',
      't:feature.dataElement.action.deleteRow',
    ]);
  });

  it('runs the action a row stands for', () => {
    const run = vi.fn();
    const menu = toContextMenuActions(buildMoveActions({ index: 1, count: 3, hasMoveTargets: false }), run, t);
    menu[1].action!();
    expect(run).toHaveBeenCalledWith('moveDown');
  });
});
