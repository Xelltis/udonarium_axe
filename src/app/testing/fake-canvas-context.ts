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
