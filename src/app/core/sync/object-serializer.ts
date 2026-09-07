import { Logger } from '@axe/core/logging/logger';
import { Attributes } from '@axe/core/sync/attributes';
import { GameObject, ObjectContext } from '@axe/core/sync/game-object';
import { ObjectFactory } from '@axe/core/sync/object-factory';
import { decodeEntityReference, encodeEntityReference, xml2element } from '@axe/core/util/xml-util';

export interface XmlAttributes extends GameObject {
  toAttributes(): Attributes;
  parseAttributes(attributes: NamedNodeMap): void;
}

export interface InnerXml extends GameObject {
  innerXml(): string;
  parseInnerXml(element: Element): void;
}

const objectPropertyKeySet = new Set(Object.getOwnPropertyNames(Object.prototype));

export class ObjectSerializer {
  private static _instance: ObjectSerializer;
  static get instance(): ObjectSerializer {
    if (!ObjectSerializer._instance) ObjectSerializer._instance = new ObjectSerializer();
    return ObjectSerializer._instance;
  }

  private constructor() {}

  toXml(gameObject: GameObject): string {
    const attributes =
      'toAttributes' in gameObject
        ? (gameObject as XmlAttributes).toAttributes()
        : ObjectSerializer.toAttributes(gameObject.toContext().syncData);
    const tagName = gameObject.aliasName;

    let attrStr = '';
    for (const name of Object.keys(attributes)) {
      const attribute = encodeEntityReference(`${attributes[name]}`);
      if (attribute == null) continue;
      attrStr += ` ${name}="${attribute}"`;
    }
    const innerXml = 'innerXml' in gameObject ? (gameObject as InnerXml).innerXml() : '';
    return `<${tagName}${attrStr}>${innerXml}</${tagName}>`;
  }

  static toAttributes(syncData: object): Attributes {
    const attributes: Attributes = {};
    for (const syncVar of Object.keys(syncData as Record<string, unknown>)) {
      Object.assign(
        attributes,
        ObjectSerializer.make2Attributes((syncData as Record<string, unknown>)[syncVar], syncVar)
      );
    }
    return attributes;
  }

  private static make2Attributes(item: unknown, key: string): Attributes {
    if (Array.isArray(item)) {
      return ObjectSerializer.array2attributes(item, key);
    } else if (item != null && typeof item === 'object') {
      return ObjectSerializer.object2attributes(item as Record<string, unknown>, key);
    } else if (item === undefined) {
      return {};
    } else {
      return { [key]: item as string | number };
    }
  }

  private static object2attributes(obj: Record<string, unknown>, rootKey: string): Attributes {
    const attributes: Attributes = {};
    for (const objKey of Object.keys(obj)) {
      Object.assign(attributes, ObjectSerializer.make2Attributes(obj[objKey], `${rootKey}.${objKey}`));
    }
    return attributes;
  }

  private static array2attributes(array: Array<unknown>, rootKey: string): Attributes {
    const attributes: Attributes = {};
    for (const [i, item] of array.entries()) {
      Object.assign(attributes, ObjectSerializer.make2Attributes(item, `${rootKey}.${i}`));
    }
    return attributes;
  }

  parseXml(xml: string | Element): GameObject | null {
    const xmlElement = typeof xml === 'string' ? xml2element(xml) : xml;
    if (!xmlElement) {
      Logger.error('[ObjectSerializer] xmlElementが空です');
      return null;
    }

    const gameObject: GameObject | null = ObjectFactory.instance.create(xmlElement.tagName);
    if (!gameObject) return null;

    if ('parseAttributes' in gameObject) {
      (gameObject as XmlAttributes).parseAttributes(xmlElement.attributes);
    } else {
      const context: ObjectContext = gameObject.toContext();
      ObjectSerializer.parseAttributes(context.syncData, xmlElement.attributes);
      gameObject.apply(context);
    }

    gameObject.initialize();
    if ('parseInnerXml' in gameObject) {
      (gameObject as InnerXml).parseInnerXml(xmlElement);
    }
    return gameObject;
  }

  static parseAttributes(syncData: object, attributes: NamedNodeMap): void {
    for (const { name, value: rawValue } of Array.from(attributes)) {
      const value = decodeEntityReference(rawValue);

      const split: string[] = name.split('.');
      let key: string | number | null = split[0];
      let obj: Record<string, unknown> | Array<unknown> = syncData as Record<string, unknown>;

      const pollutionKey = split.find((splitKey) => objectPropertyKeySet.has(splitKey));
      if (pollutionKey != null) {
        Logger.debug(`[ObjectSerializer] 無効なキーをスキップ (${pollutionKey})`);
        continue;
      }

      if (split.length > 1) {
        ({ obj, key } = ObjectSerializer.attributes2object(split, obj, key));
        if (key == null) continue;
      }

      const type = typeof (obj as Record<string, unknown>)[key as string];
      if (type !== 'string' && (obj as Record<string, unknown>)[key as string] != null) {
        const parsed = parseAttributeValue(value);
        if (parsed !== undefined) (obj as Record<string, unknown>)[key as string] = parsed;
      } else {
        (obj as Record<string, unknown>)[key as string] = value;
      }
    }
  }

  private static attributes2object(
    split: string[],
    obj: Record<string, unknown> | unknown[],
    key: string | number
  ): { obj: Record<string, unknown> | unknown[]; key: string | number | null } {
    // reading a nested structure out of dotted attributes
    // It is implemented, but it is poor xml and should not be relied on.
    let parentObj: Record<string, unknown> | Array<unknown> | null = null;

    const length = split.length;
    for (let i = 0; i < length; i++) {
      const index = parseInt(split[i], 10);
      if (parentObj && !Number.isNaN(index) && !Array.isArray(obj) && Object.keys(parentObj).length) {
        (parentObj as Record<string, unknown>)[key as string] = [];
        obj = (parentObj as Record<string, unknown>)[key as string] as unknown[];
      }
      key = Number.isNaN(index) ? split[i] : index;

      if (Array.isArray(obj) && typeof key !== 'number') {
        Logger.warn('[ObjectSerializer] Arrayにはindexの挿入しか許可しない');
        return { obj, key: null };
      }
      if (i + 1 < length) {
        if ((obj as Record<string, unknown>)[key as string] == null)
          (obj as Record<string, unknown>)[key as string] = typeof key === 'number' ? [] : {};
        parentObj = obj as Record<string, unknown>;
        obj = (obj as Record<string, unknown>)[key as string] as Record<string, unknown>;
      }
    }
    return { obj, key };
  }
}

/**
 * What an attribute says, or nothing where it says something a number or a flag cannot be.
 *
 * An empty attribute is the usual way a room ends up carrying one, and reading it as a value
 * would fail the whole room rather than leave the one field at its default.
 */
function parseAttributeValue(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}
