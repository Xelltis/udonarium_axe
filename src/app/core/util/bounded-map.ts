/**
 * A Map that keeps at most `limit` entries: setting one past the limit lets the oldest go, the
 * entries standing in the order they were first set, as a Map keeps them. Setting a key again
 * keeps its place; delete it first to make it the newest. What goes is told to `dropped`.
 */
export class BoundedMap<K, V> extends Map<K, V> {
  constructor(
    private readonly limit: number,
    private readonly dropped?: (key: K, value: V) => void
  ) {
    super();
  }

  override set(key: K, value: V): this {
    super.set(key, value);
    while (this.size > this.limit) {
      const oldest = this.keys().next();
      if (oldest.done) break;
      const gone = this.get(oldest.value) as V;
      this.delete(oldest.value);
      this.dropped?.(oldest.value, gone);
    }
    return this;
  }
}

/**
 * A Set that keeps at most `limit` members: adding one past the limit lets the oldest go, the
 * members standing in the order they were first added. Adding a member again keeps its place.
 */
export class BoundedSet<T> extends Set<T> {
  constructor(private readonly limit: number) {
    super();
  }

  override add(value: T): this {
    super.add(value);
    while (this.size > this.limit) {
      const oldest = this.values().next();
      if (oldest.done) break;
      this.delete(oldest.value);
    }
    return this;
  }
}
