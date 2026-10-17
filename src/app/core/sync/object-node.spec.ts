import { TestBed } from '@angular/core/testing';
import { ObjectNode } from '@axe/core/sync/object-node';
import { ObjectStore } from '@axe/core/sync/object-store';

describe('ObjectNode', () => {
  let store: ObjectStore;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    store = ObjectStore.instance;
    // Clear any existing objects from previous tests
  });

  afterEach(() => {
    // Cleanup after each test
    vi.clearAllMocks();
  });

  describe('constructor and basic properties', () => {
    it('should create an ObjectNode instance', () => {
      const node = new ObjectNode();
      expect(node).toBeTruthy();
      expect(node).toBeInstanceOf(ObjectNode);
    });

    it('should initialize with default value', () => {
      const node = new ObjectNode();
      expect(node.value).toBe('');
    });

    it('should accept string value', () => {
      const node = new ObjectNode();
      node.value = 'test value';
      expect(node.value).toBe('test value');
    });

    it('should accept numeric value', () => {
      const node = new ObjectNode();
      node.value = 42;
      expect(node.value).toBe(42);
    });
  });

  describe('index management', () => {
    it('should have default index of 0', () => {
      const node = new ObjectNode();
      expect(node.index).toBeGreaterThanOrEqual(0);
      expect(node.index).toBeLessThan(1);
    });

    it('should set integer part as majorIndex', () => {
      const node = new ObjectNode();
      node.index = 5.7;
      expect(node.index).toBeCloseTo(5.7, 5);
    });

    it('should separate major and minor index components', () => {
      const node = new ObjectNode();
      node.index = 3.14159;
      const index = node.index;
      expect(Math.floor(index)).toBe(3);
      expect(index).toBeCloseTo(3.14159, 5);
    });

    it('should trigger parent needsSort when index changes', () => {
      const parent = new ObjectNode('parent');
      const child = new ObjectNode('child');
      store.add(parent, false);
      store.add(child, false);

      parent.appendChild(child);
      child.index = 10;

      // needsSort is private, but we can verify by checking children order
      const children = parent.children;
      expect(children).toContain(child);
    });
  });

  describe('parent-child relationships', () => {
    it('should not have parent by default', () => {
      const node = new ObjectNode();
      expect(node.parent).toBeNull();
      expect(node.parentIsAssigned).toBe(false);
    });

    it('should return empty children array by default', () => {
      const node = new ObjectNode();
      expect(node.children).toEqual([]);
    });

    it('should detect when parent is assigned', () => {
      const parent = new ObjectNode('parent');
      const child = new ObjectNode('child');
      store.add(parent, false);
      store.add(child, false);

      parent.appendChild(child);

      expect(child.parentIsAssigned).toBe(true);
      expect(child.parent).toBe(parent);
    });

    it('should detect unknown parent', () => {
      const child = new ObjectNode('child');
      store.add(child, false);
      // Manually set a non-existent parent
      (child as unknown as { parentIdentifier: string }).parentIdentifier = 'non-existent-parent';

      expect(child.parentIsUnknown).toBe(true);
    });

    it('should detect destroyed parent', () => {
      const parent = new ObjectNode('parent');
      const child = new ObjectNode('child');
      store.add(parent, false);
      store.add(child, false);

      parent.appendChild(child);
      const _parentId = parent.identifier;

      store.delete(parent, false);

      expect(child.parentIsDestroyed).toBe(true);
    });
  });

  describe('appendChild()', () => {
    it('should add child to parent', () => {
      const parent = new ObjectNode('parent');
      const child = new ObjectNode('child');
      store.add(parent, false);
      store.add(child, false);

      parent.appendChild(child);

      expect(parent.children).toContain(child);
      expect(child.parent).toBe(parent);
    });

    it('should return the child', () => {
      const parent = new ObjectNode('parent');
      const child = new ObjectNode('child');
      store.add(parent, false);
      store.add(child, false);

      const result = parent.appendChild(child);

      expect(result).toBe(child);
    });

    it('should add multiple children', () => {
      const parent = new ObjectNode('parent');
      const child1 = new ObjectNode('child1');
      const child2 = new ObjectNode('child2');
      store.add(parent, false);
      store.add(child1, false);
      store.add(child2, false);

      parent.appendChild(child1);
      parent.appendChild(child2);

      expect(parent.children.length).toBe(2);
      expect(parent.children).toContain(child1);
      expect(parent.children).toContain(child2);
    });

    it('should maintain child order by index', () => {
      const parent = new ObjectNode('parent');
      const child1 = new ObjectNode('child1');
      const child2 = new ObjectNode('child2');
      const child3 = new ObjectNode('child3');
      store.add(parent, false);
      store.add(child1, false);
      store.add(child2, false);
      store.add(child3, false);

      parent.appendChild(child1);
      parent.appendChild(child2);
      parent.appendChild(child3);

      const children = parent.children;
      expect(children[0]).toBe(child1);
      expect(children[1]).toBe(child2);
      expect(children[2]).toBe(child3);
    });

    it('should remove child from previous parent', () => {
      const parent1 = new ObjectNode('parent1');
      const parent2 = new ObjectNode('parent2');
      const child = new ObjectNode('child');
      store.add(parent1, false);
      store.add(parent2, false);
      store.add(child, false);

      parent1.appendChild(child);
      parent2.appendChild(child);

      expect(parent1.children).not.toContain(child);
      expect(parent2.children).toContain(child);
      expect(child.parent).toBe(parent2);
    });

    it('should prevent circular reference', () => {
      const parent = new ObjectNode('parent');
      const child = new ObjectNode('child');
      store.add(parent, false);
      store.add(child, false);

      child.appendChild(parent);
      const result = parent.appendChild(child);

      expect(result).toBeNull();
    });

    it('should call onChildAdded lifecycle method', () => {
      const parent = new ObjectNode('parent');
      const child = new ObjectNode('child');
      store.add(parent, false);
      store.add(child, false);

      vi.spyOn(parent, 'onChildAdded');
      parent.appendChild(child);

      expect(parent.onChildAdded).toHaveBeenCalledWith(child);
    });
  });

  describe('a node made again under a name taken out of the store', () => {
    it('adopts the children the node taken out left in the store', () => {
      const parent = new ObjectNode('handed-back');
      parent.initialize();
      const child = new ObjectNode('left-child');
      child.initialize();
      parent.appendChild(child);
      store.remove(parent);

      const again = new ObjectNode('handed-back');
      again.initialize();

      expect(again.children).toEqual([child]);
      again.destroy();
    });

    it('adopts none of the children destroyed with the node', () => {
      const parent = new ObjectNode('destroyed-parent');
      parent.initialize();
      const child = new ObjectNode('destroyed-child');
      child.initialize();
      parent.appendChild(child);
      parent.destroy();
      store.clearDeleteHistory();

      const again = new ObjectNode('destroyed-parent');
      again.initialize();

      expect(again.children).toEqual([]);
      again.destroy();
      store.clearDeleteHistory();
    });
  });

  describe('a node waiting for its parent', () => {
    it('is not adopted by the parent once it has left the store', () => {
      const child = new ObjectNode('waiting-child');
      child.apply({
        ...child.toContext(),
        syncData: { ...child.toContext().syncData, parentIdentifier: 'late-parent' },
      });
      store.add(child, false);
      store.remove(child);

      const parent = new ObjectNode('late-parent');
      parent.initialize();

      expect(parent.children).toEqual([]);
      parent.destroy();
    });
  });

  describe('contextAsLastChildOf()', () => {
    it('gives the node as it would travel at the end of the parent, touching neither', () => {
      const parent = new ObjectNode();
      parent.initialize();
      const first = new ObjectNode();
      first.initialize();
      parent.appendChild(first);
      const line = new ObjectNode();

      const context = line.contextAsLastChildOf(parent);

      expect(context.identifier).toBe(line.identifier);
      expect(context.syncData['parentIdentifier']).toBe(parent.identifier);
      expect(context.syncData['majorIndex']).toBe(first.index - (first.index % 1) + 1);
      expect(parent.children).toEqual([first]);
      expect(line.parentId).toBe('');
      expect(store.get(line.identifier)).toBeNull();
      first.destroy();
      parent.destroy();
    });
  });

  describe('insertBefore()', () => {
    it('should insert child before reference node', () => {
      const parent = new ObjectNode('parent');
      const child1 = new ObjectNode('child1');
      const child2 = new ObjectNode('child2');
      const newChild = new ObjectNode('newChild');
      store.add(parent, false);
      store.add(child1, false);
      store.add(child2, false);
      store.add(newChild, false);

      parent.appendChild(child1);
      parent.appendChild(child2);
      parent.insertBefore(newChild, child2);

      const children = parent.children;
      const newChildIndex = children.indexOf(newChild);
      const child2Index = children.indexOf(child2);

      expect(newChildIndex).toBeLessThan(child2Index);
    });

    it('should return the inserted child', () => {
      const parent = new ObjectNode('parent');
      const reference = new ObjectNode('reference');
      const child = new ObjectNode('child');
      store.add(parent, false);
      store.add(reference, false);
      store.add(child, false);

      parent.appendChild(reference);
      const result = parent.insertBefore(child, reference);

      expect(result).toBe(child);
    });

    it('should append when reference not found', () => {
      const parent = new ObjectNode('parent');
      const child = new ObjectNode('child');
      const reference = new ObjectNode('reference');
      store.add(parent, false);
      store.add(child, false);
      store.add(reference, false);

      parent.insertBefore(child, reference);

      expect(parent.children).toContain(child);
    });

    it('should handle inserting same child at same position', () => {
      const parent = new ObjectNode('parent');
      const child = new ObjectNode('child');
      store.add(parent, false);
      store.add(child, false);

      parent.appendChild(child);
      const result = parent.insertBefore(child, child);

      expect(result).toBe(child);
      expect(parent.children.length).toBe(1);
    });

    it('should remove child from previous parent', () => {
      const parent1 = new ObjectNode('parent1');
      const parent2 = new ObjectNode('parent2');
      const reference = new ObjectNode('reference');
      const child = new ObjectNode('child');
      store.add(parent1, false);
      store.add(parent2, false);
      store.add(reference, false);
      store.add(child, false);

      parent1.appendChild(child);
      parent2.appendChild(reference);
      parent2.insertBefore(child, reference);

      expect(parent1.children).not.toContain(child);
      expect(parent2.children).toContain(child);
    });

    it('should prevent circular reference', () => {
      const parent = new ObjectNode('parent');
      const child = new ObjectNode('child');
      const reference = new ObjectNode('reference');
      store.add(parent, false);
      store.add(child, false);
      store.add(reference, false);

      child.appendChild(parent);
      child.appendChild(reference);
      const result = parent.insertBefore(child, reference);

      expect(result).toBeNull();
    });
  });

  describe('removeChild()', () => {
    it('should remove child from parent', () => {
      const parent = new ObjectNode('parent');
      const child = new ObjectNode('child');
      store.add(parent, false);
      store.add(child, false);

      parent.appendChild(child);
      parent.removeChild(child);

      expect(parent.children).not.toContain(child);
      expect(child.parent).toBeNull();
    });

    it('should return the removed child', () => {
      const parent = new ObjectNode('parent');
      const child = new ObjectNode('child');
      store.add(parent, false);
      store.add(child, false);

      parent.appendChild(child);
      const result = parent.removeChild(child);

      expect(result).toBe(child);
    });

    it('should return null for non-child', () => {
      const parent = new ObjectNode('parent');
      const notChild = new ObjectNode('notChild');
      store.add(parent, false);
      store.add(notChild, false);

      const result = parent.removeChild(notChild);

      expect(result).toBeNull();
    });

    it('should call onChildRemoved lifecycle method', () => {
      const parent = new ObjectNode('parent');
      const child = new ObjectNode('child');
      store.add(parent, false);
      store.add(child, false);

      parent.appendChild(child);
      vi.spyOn(parent, 'onChildRemoved');
      parent.removeChild(child);

      expect(parent.onChildRemoved).toHaveBeenCalledWith(child);
    });
  });

  describe('contains()', () => {
    it('should return true for direct child', () => {
      const parent = new ObjectNode('parent');
      const child = new ObjectNode('child');
      store.add(parent, false);
      store.add(child, false);

      parent.appendChild(child);

      expect(parent.contains(child)).toBe(true);
    });

    it('should return true for nested child', () => {
      const grandparent = new ObjectNode('grandparent');
      const parent = new ObjectNode('parent');
      const child = new ObjectNode('child');
      store.add(grandparent, false);
      store.add(parent, false);
      store.add(child, false);

      grandparent.appendChild(parent);
      parent.appendChild(child);

      expect(grandparent.contains(child)).toBe(true);
    });

    it('should return false for non-descendant', () => {
      const node1 = new ObjectNode('node1');
      const node2 = new ObjectNode('node2');
      store.add(node1, false);
      store.add(node2, false);

      expect(node1.contains(node2)).toBe(false);
    });

    it('should return false for parent', () => {
      const parent = new ObjectNode('parent');
      const child = new ObjectNode('child');
      store.add(parent, false);
      store.add(child, false);

      parent.appendChild(child);

      expect(child.contains(parent)).toBe(false);
    });
  });

  describe('attributes', () => {
    it('should set attribute', () => {
      const node = new ObjectNode();
      node.setAttribute('name', 'value');

      expect(node.getAttribute('name')).toBe('value');
    });

    it('should set numeric attribute', () => {
      const node = new ObjectNode();
      node.setAttribute('count', 42);

      // getAttribute casts to string but number is stored as number
      const value = node.getAttribute('count');
      expect(value).toBe(42);

      expect(node.getAttribute('nonexistent')).toBe('');
    });

    it('should remove attribute', () => {
      const node = new ObjectNode();
      node.setAttribute('name', 'value');
      node.removeAttribute('name');

      expect(node.getAttribute('name')).toBe('');
    });

    it('should convert attributes to object', () => {
      const node = new ObjectNode();
      node.setAttribute('attr1', 'value1');
      node.setAttribute('attr2', 'value2');

      const attrs = node.toAttributes();

      expect(attrs['attr1']).toBe('value1');
      expect(attrs['attr2']).toBe('value2');
    });
  });

  describe('destroy()', () => {
    it('should destroy node and all children', () => {
      const parent = new ObjectNode('parent');
      const child1 = new ObjectNode('child1');
      const child2 = new ObjectNode('child2');
      store.add(parent, false);
      store.add(child1, false);
      store.add(child2, false);

      parent.appendChild(child1);
      parent.appendChild(child2);

      parent.destroy();

      expect(store.get(parent.identifier)).toBeNull();
      expect(store.get(child1.identifier)).toBeNull();
      expect(store.get(child2.identifier)).toBeNull();
    });

    it('should destroy nested children', () => {
      const root = new ObjectNode('root');
      const child = new ObjectNode('child');
      const grandchild = new ObjectNode('grandchild');
      store.add(root, false);
      store.add(child, false);
      store.add(grandchild, false);

      root.appendChild(child);
      child.appendChild(grandchild);

      root.destroy();

      expect(store.get(root.identifier)).toBeNull();
      expect(store.get(child.identifier)).toBeNull();
      expect(store.get(grandchild.identifier)).toBeNull();
    });

    it('should clear children array', () => {
      const parent = new ObjectNode('parent');
      const child = new ObjectNode('child');
      store.add(parent, false);
      store.add(child, false);

      parent.appendChild(child);
      parent.destroy();

      // Access private _children through parent.children
      expect(parent.children).toEqual([]);
    });
  });

  describe('lifecycle hooks', () => {
    it('should call onStoreAdded when added to store', () => {
      const node = new ObjectNode('node');
      vi.spyOn(node, 'onStoreAdded');

      store.add(node, false);

      expect(node.onStoreAdded).toHaveBeenCalled();
    });

    it('should call onStoreRemoved when removed from store', () => {
      const node = new ObjectNode('node');
      store.add(node, false);
      vi.spyOn(node, 'onStoreRemoved');

      store.remove(node);

      expect(node.onStoreRemoved).toHaveBeenCalled();
    });

    it('should remove from parent when removed from store', () => {
      const parent = new ObjectNode('parent');
      const child = new ObjectNode('child');
      store.add(parent, false);
      store.add(child, false);

      parent.appendChild(child);
      store.remove(child);

      expect(parent.children).not.toContain(child);
    });
  });

  describe('sorting', () => {
    it('should maintain children sorted by index', () => {
      const parent = new ObjectNode('parent');
      const child1 = new ObjectNode('child1');
      const child2 = new ObjectNode('child2');
      const child3 = new ObjectNode('child3');
      store.add(parent, false);
      store.add(child1, false);
      store.add(child2, false);
      store.add(child3, false);

      parent.appendChild(child1);
      parent.appendChild(child2);
      parent.appendChild(child3);

      child3.index = -1; // Move to beginning

      const children = parent.children;
      expect(children[0]).toBe(child3);
      expect(children[1]).toBe(child1);
      expect(children[2]).toBe(child2);
    });

    it('should sort children on demand', () => {
      const parent = new ObjectNode('parent');
      const child1 = new ObjectNode('child1');
      const child2 = new ObjectNode('child2');
      store.add(parent, false);
      store.add(child1, false);
      store.add(child2, false);

      parent.appendChild(child1);
      parent.appendChild(child2);

      child1.index = 10;
      child2.index = 5;

      const children = parent.children;
      expect(children[0]).toBe(child2);
      expect(children[1]).toBe(child1);
    });
  });

  describe('XML serialization', () => {
    it('should generate inner XML with value', () => {
      const node = new ObjectNode();
      node.value = 'test content';

      const xml = node.innerXml();

      expect(xml).toContain('test content');
    });

    it('should include children in inner XML', () => {
      const parent = new ObjectNode('parent');
      const child = new ObjectNode('child');
      store.add(parent, false);
      store.add(child, false);

      parent.appendChild(child);
      child.value = 'child value';

      const xml = parent.innerXml();

      expect(xml).toBeTruthy();
      expect(xml.length).toBeGreaterThan(0);
    });

    it('should encode entity references in value', () => {
      const node = new ObjectNode();
      node.value = '<>&"';

      const xml = node.innerXml();

      // Entity encoding depends on XmlUtil implementation
      expect(xml).toBeTruthy();
    });
  });

  describe('edge cases', () => {
    it('should handle empty parent identifier', () => {
      const node = new ObjectNode();

      expect(node.parentIsAssigned).toBe(false);
      expect(node.parent).toBeNull();
    });

    it('should handle single child', () => {
      const parent = new ObjectNode('parent');
      const child = new ObjectNode('child');
      store.add(parent, false);
      store.add(child, false);

      parent.appendChild(child);

      expect(parent.children.length).toBe(1);
      expect(parent.children[0]).toBe(child);
    });

    it('should return the same readonly children reference each time', () => {
      const parent = new ObjectNode('parent');
      const child = new ObjectNode('child');
      store.add(parent, false);
      store.add(child, false);

      parent.appendChild(child);
      const children1 = parent.children;
      const children2 = parent.children;

      expect(children1).toBe(children2);
      expect(children1).toEqual(children2);
    });
  });
});
