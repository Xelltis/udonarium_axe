/**
 * The ruby notation of the chat, `|word《reading》` with a half- or full-width bar: the word as the
 * first group, the reading written over it as the second.
 *
 * It is global, for `replace` and `matchAll`, which start from the beginning of a line whatever an
 * earlier search left behind.
 */
export const RUBY_NOTATION = /[|｜]([^|｜\s]+?)《(.+?)》/g;
