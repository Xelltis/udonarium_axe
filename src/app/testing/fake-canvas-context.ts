/**
 * A 2D context that takes every call and every property a drawing makes, and remembers nothing.
 *
 * happy-dom has no canvas to draw on, so anything that draws returns early there and is never
 * exercised. A spec lends this to `getContext` to let a whole picture be drawn into nothing.
 */
export function contextThatTakesAnything(): CanvasRenderingContext2D {
  const values = new Map<PropertyKey, unknown>();
  const gradient = { addColorStop: () => undefined };
  return new Proxy(
    {},
    {
      get: (_target, name) => (values.has(name) ? values.get(name) : () => gradient),
      set: (_target, name, value) => {
        values.set(name, value);
        return true;
      },
    }
  ) as unknown as CanvasRenderingContext2D;
}

/** One call a drawing made on a recording context: the method's name and the arguments it was given. */
export interface RecordedCall {
  readonly name: string;
  readonly args: readonly unknown[];
}

/**
 * A 2D context that writes down every call a drawing makes, in the order they were made, so a spec
 * can read the coordinates a shape was drawn with. Properties are kept as they are set.
 */
export function contextThatRecords(): { context: CanvasRenderingContext2D; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const values = new Map<PropertyKey, unknown>();
  const context = new Proxy(
    {},
    {
      get: (_target, name) =>
        values.has(name)
          ? values.get(name)
          : (...args: unknown[]) => {
              calls.push({ name: String(name), args });
            },
      set: (_target, name, value) => {
        values.set(name, value);
        return true;
      },
    }
  ) as unknown as CanvasRenderingContext2D;
  return { context, calls };
}
