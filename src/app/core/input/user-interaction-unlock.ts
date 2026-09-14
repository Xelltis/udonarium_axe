/** The events a browser counts as the user asking for something, which is what lets audio start. */
export const USER_GESTURE_EVENTS = ['touchend', 'mousedown', 'keydown'] as const;

/**
 * For browsers that refuse to start audio before the user has touched anything.
 * It catches the first gesture that counts, calls back once and unhooks itself. A touch counts
 * when the finger lifts rather than when it lands: iOS lets nothing play from a touch that has
 * only begun, so a callback run then would start nothing and never be run again.
 * The dom work is kept here so the domain never touches the document.
 */
export function onFirstUserInteraction(callback: () => void): () => void {
  function handler() {
    unhook();
    callback();
  }
  function unhook() {
    for (const type of USER_GESTURE_EVENTS) document.body.removeEventListener(type, handler, true);
  }
  for (const type of USER_GESTURE_EVENTS) document.body.addEventListener(type, handler, true);
  return unhook;
}
