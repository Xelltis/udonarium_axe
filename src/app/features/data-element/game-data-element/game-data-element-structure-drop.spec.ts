import { DataElement, DataElementRole } from '@axe/domain/data/data-element';
import {
  canAcceptChildRole,
  canDropInside,
  canDropStructureElement,
  getElementDepth,
  getSubtreeDepth,
  listMoveTargets,
  MAX_STANDARD_DEPTH,
  resolveDropPosition,
} from '@axe/features/data-element/game-data-element/game-data-element-structure-drop';

function makeDetailTree(): {
  detail: DataElement;
  section: DataElement;
  group: DataElement;
  field: DataElement;
} {
  const detail = DataElement.create('detail', '');
  const section = DataElement.create('section', '', { role: DataElementRole.SECTION });
  const group = DataElement.create('group', '', { role: DataElementRole.GROUP });
  const field = DataElement.create('field', '0', { role: DataElementRole.FIELD });
  detail.appendChild(section);
  section.appendChild(group);
  group.appendChild(field);
  return { detail, section, group, field };
}

describe('canDropInside', () => {
  it('gives a field no children', () => {
    const field = DataElement.create('hp', '0', { role: DataElementRole.FIELD });
    expect(canDropInside(field)).toBe(false);
  });

  it('gives a group and a section children', () => {
    const group = DataElement.create('g', '', { role: DataElementRole.GROUP });
    const section = DataElement.create('s', '', { role: DataElementRole.SECTION });
    expect(canDropInside(group)).toBe(true);
    expect(canDropInside(section)).toBe(true);
  });
});

describe('canAcceptChildRole', () => {
  it('takes only sections directly under the sheet', () => {
    const detail = DataElement.create('detail', '');
    expect(canAcceptChildRole(detail, DataElementRole.SECTION)).toBe(true);
    expect(canAcceptChildRole(detail, DataElementRole.GROUP)).toBe(false);
    expect(canAcceptChildRole(detail, DataElementRole.FIELD)).toBe(false);
  });

  it('takes only groups directly under a section', () => {
    const section = DataElement.create('s', '', { role: DataElementRole.SECTION });
    expect(canAcceptChildRole(section, DataElementRole.GROUP)).toBe(true);
    expect(canAcceptChildRole(section, DataElementRole.FIELD)).toBe(false);
  });

  it('takes fields into a group', () => {
    const { group } = makeDetailTree();
    expect(canAcceptChildRole(group, DataElementRole.FIELD)).toBe(true);
  });

  it('refuses to nest a group that already sits too deep', () => {
    const { detail } = makeDetailTree();
    const s = DataElement.create('s', '', { role: DataElementRole.SECTION });
    const g1 = DataElement.create('g1', '', { role: DataElementRole.GROUP });
    const g2 = DataElement.create('g2', '', { role: DataElementRole.GROUP });
    detail.appendChild(s);
    s.appendChild(g1);
    g1.appendChild(g2);
    expect(canAcceptChildRole(g2, DataElementRole.GROUP)).toBe(false);
  });
});

describe('getElementDepth / getSubtreeDepth', () => {
  it('counts the sheet as nothing and everything under it deeper', () => {
    const { detail, section, group, field } = makeDetailTree();
    expect(getElementDepth(detail)).toBe(0);
    expect(getElementDepth(section)).toBe(0);
    expect(getElementDepth(group)).toBe(1);
    expect(getElementDepth(field)).toBe(2);
  });

  it('gives a leaf no height', () => {
    const { field } = makeDetailTree();
    expect(getSubtreeDepth(field)).toBe(0);
  });

  it('measures a section to its deepest leaf', () => {
    const { section } = makeDetailTree();
    expect(getSubtreeDepth(section)).toBe(2);
  });
});

describe('canDropStructureElement', () => {
  it('refuses a drop onto itself', () => {
    const { group } = makeDetailTree();
    expect(canDropStructureElement(group, group, 'before', 1)).toBe(false);
  });

  it('refuses a drop that would run past the deepest level allowed', () => {
    const dragged = DataElement.create('s', '', { role: DataElementRole.SECTION });
    const child = DataElement.create('g', '', { role: DataElementRole.GROUP });
    const grand = DataElement.create('f', '0', { role: DataElementRole.FIELD });
    dragged.appendChild(child);
    child.appendChild(grand);
    const target = DataElement.create('s2', '', { role: DataElementRole.SECTION });
    expect(canDropStructureElement(dragged, target, 'inside', MAX_STANDARD_DEPTH - 1)).toBe(false);
  });

  it('takes a drop inside only where the roles agree', () => {
    const detail = DataElement.create('detail', '');
    const section = DataElement.create('s', '', { role: DataElementRole.SECTION });
    detail.appendChild(section);
    const newGroup = DataElement.create('g', '', { role: DataElementRole.GROUP });
    expect(canDropStructureElement(newGroup, section, 'inside', 0)).toBe(true);

    const newField = DataElement.create('f', '0', { role: DataElementRole.FIELD });
    expect(canDropStructureElement(newField, section, 'inside', 0)).toBe(false);
  });

  it('refuses to drop an ancestor into itself, which would make a loop', () => {
    const { section, group } = makeDetailTree();
    expect(canDropStructureElement(section, group, 'inside', 1)).toBe(false);
  });
});

describe('resolveDropPosition', () => {
  it('reads the top edge as in front', () => {
    const target = DataElement.create('s', '', { role: DataElementRole.SECTION });
    expect(resolveDropPosition({ top: 100, height: 40 }, 101, target)).toBe('before');
  });

  it('reads the bottom edge as behind', () => {
    const target = DataElement.create('s', '', { role: DataElementRole.SECTION });
    expect(resolveDropPosition({ top: 100, height: 40 }, 138, target)).toBe('after');
  });

  it('reads the middle of a group or a section as inside', () => {
    const target = DataElement.create('s', '', { role: DataElementRole.SECTION });
    expect(resolveDropPosition({ top: 100, height: 40 }, 120, target)).toBe('inside');
  });

  it('reads the middle of a field as behind rather than inside', () => {
    const target = DataElement.create('f', '0', { role: DataElementRole.FIELD });
    expect(resolveDropPosition({ top: 100, height: 40 }, 120, target)).toBe('after');
  });

  it('falls back without a rectangle to measure', () => {
    const target = DataElement.create('s', '', { role: DataElementRole.SECTION });
    expect(resolveDropPosition(null, 0, target)).toBe('inside');
  });
});

describe('listMoveTargets', () => {
  function sheet(): { detail: DataElement; hp: DataElement; skills: DataElement; action: DataElement } {
    const detail = DataElement.create('detail', '');
    const resources = DataElement.create('リソース', '', { role: DataElementRole.SECTION });
    const basic = DataElement.create('基本', '', { role: DataElementRole.GROUP });
    const hp = DataElement.create('HP', '10', { role: DataElementRole.FIELD });
    const skills = DataElement.create('スキル', '', { role: DataElementRole.SECTION });
    const action = DataElement.create('アクション', '', { role: DataElementRole.GROUP });
    detail.appendChild(resources);
    resources.appendChild(basic);
    basic.appendChild(hp);
    detail.appendChild(skills);
    skills.appendChild(action);
    return { detail, hp, skills, action };
  }

  it('offers a field every other group, named by its path', () => {
    const { hp, action } = sheet();

    expect(listMoveTargets(hp)).toEqual([{ element: action, path: ['スキル', 'アクション'] }]);
  });

  it('offers a group the other sections', () => {
    const { action } = sheet();

    expect(listMoveTargets(action).map((target) => target.path)).toEqual([['リソース'], ['リソース', '基本']]);
  });

  it('never offers an element its own subtree', () => {
    const { skills, action } = sheet();
    const inner = DataElement.create('内側', '', { role: DataElementRole.GROUP });
    action.appendChild(inner);

    expect(listMoveTargets(action).map((target) => target.element)).not.toContain(inner);
    expect(listMoveTargets(skills)).toEqual([]);
  });

  it('offers nothing to an element off the sheet', () => {
    const loose = DataElement.create('メモ', '', { role: DataElementRole.FIELD });
    DataElement.create('グループ', '', { role: DataElementRole.GROUP }).appendChild(loose);

    expect(listMoveTargets(loose)).toEqual([]);
  });
});
