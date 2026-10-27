/**
 * Whether a chat line carries a resource command, `:HP-5` or `t:HP-5` and their secret forms, in
 * either width, so that playing it waits for the numbers to move.
 */
export function lineChangesResources(text: string): boolean {
  return /(^|\s)[sｓ]?[tｔ]?[:：][^\s:：&＆]/i.test(text);
}

/**
 * Whether a chat line keeps its resource commands secret, by an `s` before any of them, so that the
 * numbers it moves are kept back on the stage as they are in the chat.
 */
export function lineIsSecret(text: string): boolean {
  return /(^|\s)[sｓ][tｔ]?[:：&＆]/i.test(text);
}
