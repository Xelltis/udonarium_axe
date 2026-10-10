import { Logger } from '@axe/core/logging/logger';
import { GameObject } from '@axe/core/sync/game-object';

export interface Type<T> {
  new (identifier?: string): T;
  aliasName?: string;
}

export class ObjectFactory {
  private static _instance: ObjectFactory;
  /** The factory shared by the whole app, created on first use. */
  static get instance(): ObjectFactory {
    if (!ObjectFactory._instance) ObjectFactory._instance = new ObjectFactory();
    return ObjectFactory._instance;
  }

  private constructorMap: Map<string, Type<GameObject>> = new Map();
  private aliasMap: Map<Type<GameObject>, string> = new Map();

  private constructor() {}

  /**
   * Records a GameObject class under an alias so objects can be created from that alias.
   *
   * Without an alias the class name is used, which minification can change. Registering an alias
   * or a class a second time is logged and ignored, and the first registration stands.
   */
  register<T extends GameObject>(constructor: Type<T>, alias?: string) {
    if (!alias) {
      alias = constructor.name || constructor.toString().match(/function\s*([^(]*)\(/)?.[1] || '';
    }
    if (this.constructorMap.has(alias)) {
      Logger.error(`[ObjectFactory] alias が重複しています: ${alias}`);
      return;
    }
    if (this.aliasMap.has(constructor)) {
      Logger.error('[ObjectFactory] constructor が重複しています', constructor);
      return;
    }
    this.constructorMap.set(alias, constructor);
    this.aliasMap.set(constructor, alias);
  }

  /**
   * Constructs the class registered under the alias, with the given identifier or a new one.
   *
   * The object is not added to the store. An unknown alias logs an error and gives null.
   */
  create<T extends GameObject>(alias: string, identifier?: string): T | null {
    const classConstructor = this.constructorMap.get(alias);
    if (!classConstructor) {
      Logger.error(`${alias}という名のGameObjectクラスは定義されていません`);
      return null;
    }
    const gameObject = new classConstructor(identifier) as T;
    return gameObject;
  }

  /** The alias a class was registered under, or an empty string when it never was. */
  getAlias<T extends GameObject>(constructor: Type<T>): string {
    return this.aliasMap.get(constructor) ?? '';
  }
}
