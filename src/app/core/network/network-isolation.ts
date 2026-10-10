let isolated = false;

/** Whether this device is cut off from the room: sends stay local and object sync is ignored. */
export function isNetworkIsolated(): boolean {
  return isolated;
}

/** Cuts this device off from the room or lets it back; replay playback isolates it while it plays. */
export function setNetworkIsolated(value: boolean): void {
  isolated = value;
}
