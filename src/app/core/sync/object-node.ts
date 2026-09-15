import { Logger } from '@axe/core/logging/logger';
import { Attributes } from '@axe/core/sync/attributes';
import { defineSyncObject as SyncObject, defineSyncVariable as SyncVar } from '@axe/core/sync/decorator-core';
import { GameObject, ObjectContext } from '@axe/core/sync/game-object';
import { InnerXml, ObjectSerializer, XmlAttributes } from '@axe/core/sync/object-serializer';
import { ObjectStore } from '@axe/core/sync/object-store';
import { decodeEntityReference, encodeEntityReference } from '@axe/core/util/xml-util';

@SyncObject('node')
export class ObjectNode extends GameObject implements XmlAttributes, InnerXml {
  /** Called when a child is added or removed locally. Registered from the event extension. */
  static onChildrenChanged: ((node: ObjectNode) => void) | null = null;
  @SyncVar() value: number | string = '';
  @SyncVar() protected attributes: Attributes = {};
  @SyncVar() private parentIdentifier: string = '';
  @SyncVar() private majorIndex: number = 0;
  @SyncVar() protected minorIndex: number = Math.random();

  /**
   * The sort position among siblings; children are ordered by it.
   *
   * Setting it stores the whole and fractional parts as separate synced fields and has the parent
   * sort its children again on the next read.
   */
  get index(): number {
    return this.majorIndex + this.minorIndex;
  }
  set index(index: number) {
    this.majorIndex = index | 0;
    this.minorIndex = index - this.majorIndex;
    if (this.parent) this.parent.needsSort = true;
  }

  /** The parent node from the store; null for a root node or while the parent is not in the store. */
  get parent(): ObjectNode | null {
    return ObjectStore.instance.get<ObjectNode>(this.parentIdentifier);
  }
  /** The identifier of the parent as synced, whether or not that parent is in the store. */
  get parentId(): string {
    return this.parentIdentifier;
  }
  /** Whether the node names a parent at all, whether or not that parent is in the store. */
  get parentIsAssigned(): boolean {
    // Replacing the sync data wholesale leaves anything missing undefined rather than back at its default.
    return (this.parentIdentifier?.length ?? 0) > 0;
  }
  /** Whether the node names a parent that is not in the store, not yet arrived or already deleted. */
  get parentIsUnknown(): boolean {
    return this.parentIsAssigned && ObjectStore.instance.get(this.parentIdentifier) == null;
  }
  /** Whether the parent the node names has been deleted, which leaves the node an orphan. */
  get parentIsDestroyed(): boolean {
    return this.parentIsAssigned && ObjectStore.instance.isDeleted(this.parentIdentifier);
  }

  private _children: ObjectNode[] = [];
  /**
   * The child nodes in index order, sorted lazily after an index changes.
   *
   * The array is the node's own; change it through appendChild, insertBefore and removeChild.
   */
  get children(): readonly ObjectNode[] {
    if (this.needsSort) {
      this.needsSort = false;
      this._children.sort((a, b) => a.index - b.index);
    }
    return this._children;
  }

  private static pendingChildrenByParentId: Record<string, ObjectNode[]> = {};
  private needsSort: boolean = true;

  /** Deletes the node and then every node beneath it, telling the room about each. */
  override destroy() {
    super.destroy();
    for (const child of [...this._children]) {
      child.destroy();
    }
    this._children = [];
  }

  // GameObject Lifecycle
  /** Also adopts the children that reached the store before this node and were waiting for it. */
  override onStoreAdded() {
    super.onStoreAdded();
    this.initializeChildren();
  }

  // GameObject Lifecycle
  /** Also takes the node out of its parent's children. */
  override onStoreRemoved() {
    super.onStoreRemoved();
    if (this.parent) this.parent.removeChild(this);
  }

  // ObjectNode Lifecycle
  /** Hook run when a node joins this node or any node beneath it, whether moved here or by a peer. */
  onChildAdded(_child: ObjectNode) {}

  // ObjectNode Lifecycle
  /** Hook run when a node leaves this node or any node beneath it, whether moved here or by a peer. */
  onChildRemoved(_child: ObjectNode) {}

  private _onChildAdded(child: ObjectNode) {
    this.onChildAdded(child);
    for (let current = this.parent; current && current !== this; current = current.parent) {
      current.onChildAdded(child);
    }
    ObjectNode.onChildrenChanged?.(this);
  }

  private _onChildRemoved(child: ObjectNode) {
    this.onChildRemoved(child);
    for (let current = this.parent; current && current !== this; current = current.parent) {
      current.onChildRemoved(child);
    }
    ObjectNode.onChildrenChanged?.(this);
  }

  private initializeChildren() {
    const objects = ObjectNode.pendingChildrenByParentId[this.identifier];
    if (objects == null) return;
    for (const object of objects) {
      if (object.parent === this) this.updateChildren(object);
    }
    delete ObjectNode.pendingChildrenByParentId[this.identifier];
  }

  private updateChildren(child: ObjectNode = this) {
    let index = this._children.indexOf(child);
    let isAdded = false;
    const isMyChild = child.parent === this;

    if (index < 0 && isMyChild) {
      this._children.push(child);
      index = this._children.length - 1;
      isAdded = true;
    } else if (index >= 0 && !isMyChild) {
      this._children.splice(index, 1);
      this._onChildRemoved(child);
      return;
    } else if (index < 0 && !isMyChild) {
      return;
    }

    const childrenLength = this._children.length;
    if (!childrenLength) return;
    const prevIndex = Math.max(0, index - 1);
    const nextIndex = Math.min(childrenLength - 1, index + 1);

    if (this._children[prevIndex].index > child.index || child.index > this._children[nextIndex].index)
      this.needsSort = true;
    if (isAdded) this._onChildAdded(child);
  }

  private updateIndexes() {
    const children = this.children;
    for (let i = 0; i < children.length; i++) {
      children[i].majorIndex = i;
      children[i].minorIndex = Math.random();
    }
  }

  /**
   * Moves a node to the end of this node's children, taking it from its old parent first.
   *
   * The move is synced like any change. When this node sits beneath the child, which would make a
   * cycle, nothing changes and null comes back.
   */
  appendChild<T extends ObjectNode>(child: T): T | null {
    if (child.contains(this)) return null;

    if (child.parent && child.parent !== this) child.parent.removeChild(child);

    const lastIndex = this.children.length > 0 ? this.children[this.children.length - 1].majorIndex + 1 : 0;

    child.parentIdentifier = this.identifier;
    child.majorIndex = lastIndex;
    child.minorIndex = Math.random();

    this.updateChildren(child);

    return child;
  }

  /**
   * Moves a node into this node's children just before the reference node.
   *
   * The new index falls between the reference and the sibling before it, and every child is
   * renumbered once that gap gets too small. A reference that is not a child appends instead, and a
   * move that would make a cycle changes nothing and gives null.
   */
  insertBefore<T extends ObjectNode>(child: T, reference: ObjectNode): T | null {
    if (child.contains(this)) return null;
    if (child === reference && child.parent === this) return child;

    if (child.parent && child.parent !== this) child.parent.removeChild(child);

    const index = this.children.indexOf(reference);
    if (index < 0) return this.appendChild(child);

    child.parentIdentifier = this.identifier;

    const prevIndex = index > 0 ? this.children[index - 1].index : 0;
    const diff = reference.index - prevIndex;
    const insertIndex = prevIndex + diff * (0.45 + 0.1 * Math.random());
    child.majorIndex = insertIndex | 0;
    child.minorIndex = insertIndex - child.majorIndex;

    this.updateChildren(child);
    if (diff < 1e-7) {
      this.updateIndexes();
    }

    return child;
  }

  /** Detaches a child, leaving it in the store without a parent; null when it is not a child. */
  removeChild<T extends ObjectNode>(child: T): T | null {
    const children = this.children;
    const index: number = children.indexOf(child);
    if (index < 0) return null;

    child.parentIdentifier = '';
    child.majorIndex = 0;
    child.minorIndex = Math.random();

    this.updateChildren(child);
    return child;
  }

  /**
   * Whether the given node sits anywhere beneath this node.
   *
   * A parent chain that loops back on itself is logged and counts as not contained.
   */
  contains(child: ObjectNode): boolean {
    let parent = child.parent;
    while (parent) {
      if (parent === child) {
        Logger.error('[ObjectNode] 循環参照を検出', child);
        return false;
      }
      if (parent === this) return true;
      parent = parent.parent;
    }
    return false;
  }

  /** Sets an attribute, saved as an XML attribute of the node, and sends the change to the room. */
  setAttribute(name: string, value: number | string) {
    this.attributes[name] = value;
    this.update();
  }

  /**
   * Reads an attribute, or an empty string when it is not set.
   *
   * The value comes back as stored, so a number set earlier is still a number despite the type.
   */
  getAttribute(name: string): string {
    if (this.attributes[name] == null) {
      return '';
    }
    return this.attributes[name] as string;
  }

  /** Removes an attribute from the node and sends the change to the room. */
  removeAttribute(name: string) {
    delete this.attributes[name];
    this.update();
  }

  /** The attributes for saving as XML: nested values get dotted names, empty ones are left out. */
  toAttributes(): Attributes {
    return ObjectSerializer.toAttributes(this.attributes);
  }

  /** Fills the attributes in from a saved element, in place and without sending anything. */
  parseAttributes(attributes: NamedNodeMap) {
    ObjectSerializer.parseAttributes(this.attributes, attributes);
  }

  /** The node's saved content: its value as text, followed by the XML of each child in order. */
  innerXml(): string {
    let xml = '';
    xml += encodeEntityReference(`${this.value}`);
    for (const child of this.children) {
      xml += ObjectSerializer.instance.toXml(child);
    }
    return xml;
  }

  /**
   * Reads a saved element's content: child elements become children, otherwise the text is the value.
   *
   * Each child is created, added to the store and appended, all of which reaches the room.
   */
  parseInnerXml(element: Element) {
    const children = element.children;
    const length = children.length;
    if (length > 0) {
      for (let i = 0; i < length; i++) {
        const child = ObjectSerializer.instance.parseXml(children[i]);
        if (child instanceof ObjectNode) this.appendChild(child);
      }
    } else {
      this.value = decodeEntityReference(element.innerHTML);
    }
  }

  /**
   * Applies a received context, then moves the node from its old parent's children to the new one's.
   *
   * When the new parent is not in the store yet, the node waits and is adopted once it arrives.
   */
  override apply(context: ObjectContext) {
    const oldParent = this.parent;
    super.apply(context);
    if (oldParent && this.parent !== oldParent) oldParent.updateChildren(this);
    if (this.parent) {
      this.parent.updateChildren(this);
    } else if (this.parentIsAssigned) {
      if (!(this.parentIdentifier in ObjectNode.pendingChildrenByParentId)) {
        ObjectNode.pendingChildrenByParentId[this.parentIdentifier] = [];
      }
      ObjectNode.pendingChildrenByParentId[this.parentIdentifier].push(this);
    }
  }
}
