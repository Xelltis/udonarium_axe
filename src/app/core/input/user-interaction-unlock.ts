/** The events a browser counts as the user asking for something, which is what lets audio start. */
export const USER_GESTURE_EVENTS = ['touchend', 'mousedown', 'keydown'] as const;

/**
 * For browsers that refuse to start audio before the user has touched anything.
 * It calls back on each gesture until the callback returns true to say what it wanted has started,
 * then unhooks itself. A gesture is not always one the browser counts: a finger lifting at the end
 * of a pan or a drag lets nothing play, so the callback reports whether the gesture was enough and
 * must be safe to run again. A touch is caught when the finger lifts rather than when it lands, since
 * iOS lets nothing play from a touch that has only begun.
 * The dom work is kept here so the domain never touches the document.
 */
export function onFirstUserInteraction(callback: () => boolean): () => void {
  function handler() {
    if (callback()) unhook();
  }
  function unhook() {
    for (const type of USER_GESTURE_EVENTS) document.body.removeEventListener(type, handler, true);
  }
  for (const type of USER_GESTURE_EVENTS) document.body.addEventListener(type, handler, true);
  return unhook;
}
