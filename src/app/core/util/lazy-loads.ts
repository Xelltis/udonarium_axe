/** The lazy loads of code under way, kept until each has arrived or failed. */
const underWay = new Set<Promise<void>>();

/**
 * Keeps a lazy load of code as under way until it has arrived or failed, and hands it back as it is:
 * for what must not end before the loads it started arrive, as a spec, whose page is taken down when
 * it ends, to wait for them by {@link lazyLoadsSettled}.
 */
export function trackLazyLoad<T>(load: Promise<T>): Promise<T> {
  const settled = load.then(
    () => undefined,
    () => undefined
  );
  underWay.add(settled);
  void settled.then(() => underWay.delete(settled));
  return load;
}

/** Settles once every lazy load of code under way now has arrived or failed. */
export function lazyLoadsSettled(): Promise<void> {
  return Promise.all([...underWay]).then(() => undefined);
}
