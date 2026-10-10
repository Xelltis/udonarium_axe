import { GameObject } from '@axe/core/sync/game-object';
import { ObjectFactory, Type } from '@axe/core/sync/object-factory';
import { ObjectNode } from '@axe/core/sync/object-node';

/**
 * Class decorator that registers a GameObject class with the object factory under an alias.
 *
 * The alias is the XML tag name and the type name every synced context carries, so it has to
 * stay stable and unique; a second registration of the same alias is logged and ignored.
 */
export function defineSyncObject(alias: string) {
  return <T extends GameObject>(constructor: Type<T>) => {
    ObjectFactory.instance.register(constructor, alias);
  };
}

function defineAccessor(target: object, key: string | symbol, getter: () => unknown, setter: (value: unknown) => void) {
  Object.defineProperty(target, key, {
    get: getter,
    set: setter,
    enumerable: true,
    configurable: true,
  });
}

/**
 * Property decorator that keeps a field in the object's sync data rather than on the instance.
 *
 * Every assignment calls update(), which bumps the version and sends the object to the room.
 * Mutating the value in place does not. The key defaults to the property name.
 */
export function defineSyncVariable(syncKey?: string | symbol) {
  return <T extends GameObject>(target: T, key: string | symbol) => {
    const dataKey = syncKey ?? key;

    function getter(this: { context: { syncData: Record<string | symbol, unknown> } }) {
      return this.context.syncData[dataKey];
    }

    function setter(this: { context: { syncData: Record<string | symbol, unknown> }; update(): void }, value: unknown) {
      this.context.syncData[dataKey] = value;
      this.update();
    }

    defineAccessor(target, key, getter, setter);
  };
}

/**
 * Property decorator that maps an ObjectNode field onto one of the node's attributes.
 *
 * The value is saved as an XML attribute of the node. Reading a missing attribute gives an
 * empty string, and writing goes through setAttribute, so it updates and broadcasts the node.
 */
export function defineSyncAttribute(syncKey?: string) {
  return <T extends ObjectNode>(target: T, key: string | symbol) => {
    const attrName = syncKey ?? (key as string);

    function getter(this: { getAttribute(name: string): string }) {
      return this.getAttribute(attrName);
    }

    function setter(this: { setAttribute(name: string, value: number | string): void }, value: number | string) {
      this.setAttribute(attrName, value);
    }

    defineAccessor(target, key, getter, setter as (value: unknown) => void);
  };
}
