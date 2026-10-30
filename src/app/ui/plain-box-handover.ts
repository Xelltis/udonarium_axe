/** Where the reader stands in a plain box: the caret, and whether the box holds the keys. */
export interface PlainBoxStand {
  readonly selection: { readonly from: number; readonly to: number };
  readonly focused: boolean;
}

/**
 * Follows a plain box an editor is to take the place of, from the moment the editor arrives, and
 * answers where the reader stands in it when asked, as the editor is put in. The box goes on taking
 * keys until the page is drawn again without it, which a busy page puts off, so what it held as the
 * editor arrived may be stale by then.
 *
 * The caret is read from the box as it is asked for, as a box keeps it once taken off the page. The
 * keys are the box's where it still holds them, or where it held them at any time since the editor
 * arrived and nothing else holds them now, as taking a box that holds the keys off the page leaves
 * them with the page itself.
 */
export function followPlainBox(box: HTMLTextAreaElement): () => PlainBoxStand {
  const document = box.ownerDocument;
  let held = document.activeElement === box;
  const take = () => (held = true);
  box.addEventListener('focus', take);
  return () => {
    box.removeEventListener('focus', take);
    const active = document.activeElement;
    const focused = active === box || (held && (active === null || active === document.body));
    return { selection: { from: box.selectionStart, to: box.selectionEnd }, focused };
  };
}
