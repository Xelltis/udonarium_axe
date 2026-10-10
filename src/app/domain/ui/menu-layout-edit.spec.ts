import { isMenuGroup, MenuGroup, MenuLayout } from '@axe/domain/ui/menu-layout';
import {
  addMenuGroup,
  addMenuItem,
  dropMenuNode,
  findMenuNode,
  menuDropSpot,
  moveMenuNode,
  moveMenuNodeInto,
  orderMenuNodes,
  parentOfMenuNode,
  removeMenuNode,
  renameMenuNode,
  setMenuNodeIcon,
} from '@axe/domain/ui/menu-layout-edit';

describe('arranging a menu', () => {
  function layout(): MenuLayout {
    return {
      nodes: [
        { id: 'chat', command: 'chat' },
        { id: 'peerMenu', command: 'peerMenu' },
        {
          id: 'table',
          icon: 'table_restaurant',
          labelKey: 'app.fab.table',
          items: [
            { id: 'tableSetting', command: 'tableSetting' },
            { id: 'mapEditor', command: 'mapEditor' },
          ],
        },
      ],
    };
  }

  function groupIn(held: MenuLayout, id: string): MenuGroup {
    const node = held.nodes.find((each) => each.id === id);
    expect(node && isMenuGroup(node)).toBe(true);
    return node as MenuGroup;
  }

  describe('putting something on', () => {
    it('puts a command on the end of the menu', () => {
      const after = addMenuItem(layout(), 'jukebox');

      expect(after.nodes.map((node) => node.id)).toEqual(['chat', 'peerMenu', 'table', 'jukebox']);
    });

    it('puts a command on the end of a small menu', () => {
      const after = addMenuItem(layout(), 'jukebox', 'table');

      expect(groupIn(after, 'table').items.map((item) => item.command)).toEqual([
        'tableSetting',
        'mapEditor',
        'jukebox',
      ]);
    });

    it('names a second helping of the same command apart from the first', () => {
      const after = addMenuItem(addMenuItem(layout(), 'jukebox'), 'jukebox');

      const ids = after.nodes.map((node) => node.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.filter((id) => id.startsWith('jukebox'))).toHaveLength(2);
    });

    it('makes a small menu of its own with nothing in it', () => {
      const after = addMenuGroup(layout(), 'よく使う');

      const made = after.nodes[after.nodes.length - 1] as MenuGroup;
      expect(isMenuGroup(made)).toBe(true);
      expect(made.label).toBe('よく使う');
      expect(made.items).toEqual([]);
    });
  });

  describe('taking something off', () => {
    it('takes an entry off the menu', () => {
      expect(removeMenuNode(layout(), 'chat').nodes.map((node) => node.id)).toEqual(['peerMenu', 'table']);
    });

    it('takes an entry out of a small menu', () => {
      expect(groupIn(removeMenuNode(layout(), 'mapEditor'), 'table').items.map((item) => item.id)).toEqual([
        'tableSetting',
      ]);
    });

    it('takes what is in a small menu away with it', () => {
      const after = removeMenuNode(layout(), 'table');

      expect(after.nodes.map((node) => node.id)).toEqual(['chat', 'peerMenu']);
      expect(findMenuNode(after, 'mapEditor')).toBeNull();
    });
  });

  describe('calling something else', () => {
    it('calls an entry what somebody asked', () => {
      const after = renameMenuNode(layout(), 'chat', ' おしゃべり ');

      expect(findMenuNode(after, 'chat')).toMatchObject({ label: 'おしゃべり' });
    });

    it('leaves an entry to name itself again when the name is taken away', () => {
      const named = renameMenuNode(layout(), 'chat', 'おしゃべり');

      expect(findMenuNode(renameMenuNode(named, 'chat', '  '), 'chat')).not.toHaveProperty('label');
    });

    it('gives an entry a mark, and takes it back', () => {
      const marked = setMenuNodeIcon(layout(), 'chat', 'forum');
      expect(findMenuNode(marked, 'chat')).toMatchObject({ icon: 'forum' });

      expect(findMenuNode(setMenuNodeIcon(marked, 'chat', ''), 'chat')).not.toHaveProperty('icon');
    });

    it('gives a small menu the plain folder back rather than no mark at all', () => {
      expect(groupIn(setMenuNodeIcon(layout(), 'table', ''), 'table').icon).toBe('folder');
    });
  });

  describe('moving things about', () => {
    it('moves an entry a step up the menu', () => {
      expect(moveMenuNode(layout(), 'peerMenu', -1).nodes.map((node) => node.id)).toEqual([
        'peerMenu',
        'chat',
        'table',
      ]);
    });

    it('moves an entry a step down inside its small menu', () => {
      expect(groupIn(moveMenuNode(layout(), 'tableSetting', 1), 'table').items.map((item) => item.id)).toEqual([
        'mapEditor',
        'tableSetting',
      ]);
    });

    it('leaves the menu alone where the step would fall off the end', () => {
      expect(moveMenuNode(layout(), 'chat', -1).nodes.map((node) => node.id)).toEqual(['chat', 'peerMenu', 'table']);
    });

    it('carries an entry into a small menu', () => {
      const after = moveMenuNodeInto(layout(), 'chat', 'table');

      expect(after.nodes.map((node) => node.id)).toEqual(['peerMenu', 'table']);
      expect(groupIn(after, 'table').items.map((item) => item.id)).toEqual(['tableSetting', 'mapEditor', 'chat']);
      expect(parentOfMenuNode(after, 'chat')).toBe('table');
    });

    it('carries an entry back out onto the menu', () => {
      const after = moveMenuNodeInto(layout(), 'mapEditor', null);

      expect(after.nodes.map((node) => node.id)).toEqual(['chat', 'peerMenu', 'table', 'mapEditor']);
      expect(parentOfMenuNode(after, 'mapEditor')).toBeNull();
    });

    it('will not carry a small menu into a small menu, one level being as deep as it goes', () => {
      const two = addMenuGroup(layout(), 'よく使う');
      const id = two.nodes[two.nodes.length - 1].id;

      expect(moveMenuNodeInto(two, id, 'table')).toBe(two);
    });

    it('leaves the menu alone where the entry is already there', () => {
      const held = layout();
      expect(moveMenuNodeInto(held, 'mapEditor', 'table')).toBe(held);
      expect(moveMenuNodeInto(held, 'chat', null)).toBe(held);
    });

    it('puts a menu in the order it is given', () => {
      const after = orderMenuNodes(layout(), null, ['table', 'chat', 'peerMenu']);

      expect(after.nodes.map((node) => node.id)).toEqual(['table', 'chat', 'peerMenu']);
    });

    it('leaves the menu alone where the order given is not all of it', () => {
      const held = layout();

      expect(orderMenuNodes(held, null, ['chat']).nodes.map((node) => node.id)).toEqual(['chat', 'peerMenu', 'table']);
    });
  });

  describe('dropping one entry beside another', () => {
    function idsIn(held: MenuLayout, id: string): string[] {
      return groupIn(held, id).items.map((item) => item.id);
    }

    function idsOf(held: MenuLayout): string[] {
      return held.nodes.map((node) => node.id);
    }

    it('lands where it was dropped, counting from before it was lifted out', () => {
      expect(idsOf(dropMenuNode(layout(), 'chat', 'peerMenu', 'after'))).toEqual(['peerMenu', 'chat', 'table']);
      expect(idsOf(dropMenuNode(layout(), 'table', 'chat', 'before'))).toEqual(['table', 'chat', 'peerMenu']);
    });

    it('reads the gap under the head of a small menu as being inside it', () => {
      expect(menuDropSpot(layout(), 'chat', 'table', 'after')).toEqual({ parent: 'table', index: 0 });
      expect(idsIn(dropMenuNode(layout(), 'chat', 'table', 'after'), 'table')).toEqual([
        'chat',
        'tableSetting',
        'mapEditor',
      ]);
    });

    it('reads the gap above the head of a small menu as being outside it', () => {
      expect(menuDropSpot(layout(), 'chat', 'table', 'before')).toEqual({ parent: null, index: 2 });
    });

    it('carries an entry in when it is dropped beside what a small menu holds', () => {
      const after = dropMenuNode(layout(), 'chat', 'mapEditor', 'after');

      expect(idsIn(after, 'table')).toEqual(['tableSetting', 'mapEditor', 'chat']);
      expect(idsOf(after)).toEqual(['peerMenu', 'table']);
    });

    it('carries an entry back out when it is dropped beside one on the menu itself', () => {
      const after = dropMenuNode(layout(), 'mapEditor', 'chat', 'before');

      expect(idsOf(after)).toEqual(['mapEditor', 'chat', 'peerMenu', 'table']);
      expect(idsIn(after, 'table')).toEqual(['tableSetting']);
    });

    it('moves an entry about inside the small menu it is already in', () => {
      expect(idsIn(dropMenuNode(layout(), 'tableSetting', 'mapEditor', 'after'), 'table')).toEqual([
        'mapEditor',
        'tableSetting',
      ]);
    });

    it('lands a small menu beside the one holding what it was dropped on, never inside it', () => {
      const two = addMenuGroup(layout(), 'よく使う');
      const id = two.nodes[two.nodes.length - 1].id;

      expect(menuDropSpot(two, id, 'mapEditor', 'after')).toEqual({ parent: null, index: 3 });
      expect(idsOf(dropMenuNode(two, id, 'mapEditor', 'before'))).toEqual(['chat', 'peerMenu', id, 'table']);
    });

    it('will not drop a small menu onto what it holds', () => {
      const held = layout();

      expect(menuDropSpot(held, 'table', 'mapEditor', 'after')).toBeNull();
      expect(dropMenuNode(held, 'table', 'mapEditor', 'after')).toBe(held);
    });

    it('leaves the menu alone where it lands where it already stood', () => {
      const held = layout();

      expect(dropMenuNode(held, 'chat', 'peerMenu', 'before')).toBe(held);
      expect(dropMenuNode(held, 'chat', 'chat', 'after')).toBe(held);
      expect(dropMenuNode(held, 'chat', 'nowhere', 'after')).toBe(held);
    });
  });

  describe('finding things', () => {
    it('finds an entry wherever it sits', () => {
      expect(findMenuNode(layout(), 'mapEditor')).toMatchObject({ command: 'mapEditor' });
      expect(findMenuNode(layout(), 'nowhere')).toBeNull();
    });

    it('says which small menu an entry sits in', () => {
      expect(parentOfMenuNode(layout(), 'mapEditor')).toBe('table');
      expect(parentOfMenuNode(layout(), 'chat')).toBeNull();
    });
  });
});
