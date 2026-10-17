let isolated = false;

/** Whether this device is cut off from the room: sends stay local and object sync is ignored. */
export function isNetworkIsolated(): boolean {
  return isolated;
}

const endedListeners = new Set<() => void>();

/** Cuts this device off from the room or lets it back; replay playback isolates it while it plays. */
export function setNetworkIsolated(value: boolean): void {
  const ended = isolated && !value;
  isolated = value;
  if (ended) for (const listener of [...endedListeners]) listener();
}

/** Calls back each time this device is let back into the room after being cut off; gives a way to stop. */
export function onNetworkIsolationEnded(listener: () => void): () => void {
  endedListeners.add(listener);
  return () => endedListeners.delete(listener);
}
