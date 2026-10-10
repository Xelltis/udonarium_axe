import { TranslateFn } from '@axe/application/i18n/translate.token';
import { ContextMenuAction, ContextMenuSeparator } from '@axe/application/ui/context-menu.service';

/** Something that can be done to a sheet row or to a group or section heading. */
export type DataElementActionId =
  | 'copyReference'
  | 'togglePopup'
  | 'fieldOptions'
  | 'addSibling'
  | 'tableView'
  | 'tableSettings'
  | 'duplicate'
  | 'saveTemplate'
  | 'addImage'
  | 'addGroup'
  | 'addFromTemplate'
  | 'addField'
  | 'moveToTop'
  | 'moveUp'
  | 'moveDown'
  | 'moveToBottom'
  | 'moveTo'
  | 'delete';

/** One action as a button, a menu row or a line of the editor draws it. */
export interface DataElementAction {
  id: DataElementActionId;
  icon: string;
  labelKey: string;
  /** Drawn as something that destroys, so it stands apart from the rest. */
  tone?: 'danger';
  /** Whether the setting the action toggles is on. */
  pressed?: boolean;
  /** Whether a wide sheet shows it in the row's own bar; the rest are only in the editor and the handle's menu. */
  inline: boolean;
  /**
   * Keeps the action's slot in the row's bar without offering it, so the buttons after it stay in
   * line with the rows above and below.
   */
  placeholder?: boolean;
}

/** What a field row can do where it stands. */
export interface FieldActionContext {
  isPopup: boolean;
  hasFieldOptions: boolean;
  fieldOptionsOpen: boolean;
  canAddSibling: boolean;
  canDuplicate: boolean;
}

/** What a group or section heading can do where it stands. */
export interface ContainerActionContext {
  isImage: boolean;
  isPopup: boolean;
  canToggleTableView: boolean;
  isTableView: boolean;
  hasTableSettings: boolean;
  settingsOpen: boolean;
  canDuplicate: boolean;
  canSaveTemplate: boolean;
  canAddGroup: boolean;
  hasTemplates: boolean;
  templateMenuOpen: boolean;
  canAddField: boolean;
}

/** Where an element stands among the ones beside it, and whether it has anywhere else to go. */
export interface MoveActionContext {
  index: number;
  count: number;
  hasMoveTargets: boolean;
}

/**
 * The actions of a field row, in the order its bar shows them.
 *
 * The settings button keeps its slot as a placeholder on a field without settings, so the add and
 * delete buttons line up down the section.
 */
export function buildFieldActions(ctx: FieldActionContext): DataElementAction[] {
  const actions: DataElementAction[] = [
    { id: 'copyReference', icon: 'content_copy', labelKey: 'feature.dataElement.action.copyReference', inline: true },
    {
      id: 'togglePopup',
      icon: 'open_in_new',
      labelKey: 'feature.dataElement.action.popupShow',
      pressed: ctx.isPopup,
      inline: true,
    },
    {
      id: 'fieldOptions',
      icon: 'tune',
      labelKey: 'feature.dataElement.action.fieldOptions',
      pressed: ctx.fieldOptionsOpen,
      inline: true,
      ...(ctx.hasFieldOptions ? {} : { placeholder: true }),
    },
  ];
  if (ctx.canAddSibling) {
    actions.push({ id: 'addSibling', icon: 'add', labelKey: 'feature.dataElement.action.addRow', inline: true });
  }
  if (ctx.canDuplicate) {
    actions.push({
      id: 'duplicate',
      icon: 'library_add',
      labelKey: 'feature.dataElement.action.duplicate',
      inline: false,
    });
  }
  actions.push({
    id: 'delete',
    icon: 'delete_outline',
    labelKey: 'feature.dataElement.action.deleteRow',
    tone: 'danger',
    inline: true,
  });
  return actions;
}

/** The actions of a group or section heading, in the order its bar shows them. */
export function buildContainerActions(ctx: ContainerActionContext): DataElementAction[] {
  const actions: DataElementAction[] = [];
  if (ctx.canToggleTableView) {
    actions.push({
      id: 'tableView',
      icon: 'table_chart',
      labelKey: ctx.isTableView ? 'feature.dataElement.action.normalView' : 'feature.dataElement.action.tableView',
      pressed: ctx.isTableView,
      inline: true,
    });
  }
  if (ctx.hasTableSettings) {
    actions.push({
      id: 'tableSettings',
      icon: 'tune',
      labelKey: 'feature.dataElement.action.tableSettings',
      pressed: ctx.settingsOpen,
      inline: true,
    });
  }
  actions.push({
    id: 'togglePopup',
    icon: 'open_in_new',
    labelKey: 'feature.dataElement.action.popupShow',
    pressed: ctx.isPopup,
    inline: true,
  });
  if (ctx.canDuplicate) {
    actions.push({
      id: 'duplicate',
      icon: 'library_add',
      labelKey: 'feature.dataElement.action.duplicate',
      inline: true,
    });
  }
  if (ctx.canSaveTemplate) {
    actions.push({
      id: 'saveTemplate',
      icon: 'bookmark_add',
      labelKey: 'feature.dataElement.action.saveTemplate',
      inline: true,
    });
  }
  if (ctx.isImage) {
    actions.push({ id: 'addImage', icon: 'add', labelKey: 'feature.dataElement.action.addImage', inline: true });
  } else {
    if (ctx.canAddGroup) {
      actions.push({
        id: 'addGroup',
        icon: 'create_new_folder',
        labelKey: 'feature.dataElement.action.addGroup',
        inline: true,
      });
    }
    if (ctx.hasTemplates) {
      actions.push({
        id: 'addFromTemplate',
        icon: 'bookmarks',
        labelKey: 'feature.dataElement.action.addFromTemplate',
        pressed: ctx.templateMenuOpen,
        inline: true,
      });
    }
    if (ctx.canAddField) {
      actions.push({ id: 'addField', icon: 'add', labelKey: 'feature.dataElement.action.addRowChild', inline: true });
    }
  }
  actions.push({
    id: 'delete',
    icon: 'delete_outline',
    labelKey: 'feature.dataElement.action.deleteSection',
    tone: 'danger',
    inline: true,
  });
  return actions;
}

/**
 * The moves an element can make, for the editor and the handle's menu.
 *
 * A move the element cannot make from where it stands is left out, and the ends are only offered
 * when they are further than one place away, as the reorder menus elsewhere do.
 */
export function buildMoveActions(ctx: MoveActionContext): DataElementAction[] {
  const { index, count } = ctx;
  const actions: DataElementAction[] = [];
  if (index > 1) {
    actions.push({ id: 'moveToTop', icon: 'vertical_align_top', labelKey: 'common.reorder.toTop', inline: false });
  }
  if (index > 0) actions.push({ id: 'moveUp', icon: 'arrow_upward', labelKey: 'common.reorder.up', inline: false });
  if (index < count - 1) {
    actions.push({ id: 'moveDown', icon: 'arrow_downward', labelKey: 'common.reorder.down', inline: false });
  }
  if (index < count - 2) {
    actions.push({
      id: 'moveToBottom',
      icon: 'vertical_align_bottom',
      labelKey: 'common.reorder.toBottom',
      inline: false,
    });
  }
  if (ctx.hasMoveTargets) {
    actions.push({
      id: 'moveTo',
      icon: 'drive_file_move',
      labelKey: 'feature.dataElement.action.moveTo',
      inline: false,
    });
  }
  return actions;
}

/**
 * The actions as a context menu: the moves first, then everything else, with the delete set apart
 * at the end. Placeholders are left out.
 */
export function toContextMenuActions(
  actions: readonly DataElementAction[],
  run: (id: DataElementActionId) => void,
  t: TranslateFn
): ContextMenuAction[] {
  const offered = actions.filter((action) => !action.placeholder);
  const isMove = (action: DataElementAction) => action.id.startsWith('move');
  const groups = [
    offered.filter(isMove),
    offered.filter((action) => !isMove(action) && action.tone !== 'danger'),
    offered.filter((action) => action.tone === 'danger'),
  ].filter((group) => group.length > 0);
  const menu: ContextMenuAction[] = [];
  groups.forEach((group, index) => {
    if (index > 0) menu.push(ContextMenuSeparator);
    for (const action of group) menu.push({ name: t(action.labelKey), action: () => run(action.id) });
  });
  return menu;
}
