/** The longest contact taken from the room server, which a real page or mail address stays well within. */
const MAX_CONTACT_LENGTH = 2048;

/**
 * The room server operator's contact as the server gave it, for those it turned away: a page over
 * https or a mail address. Null for none, and for anything else, which is not shown as a link.
 */
export function readOperatorContact(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || MAX_CONTACT_LENGTH < value.length) return null;
  try {
    const { protocol } = new URL(value);
    return protocol === 'https:' || protocol === 'mailto:' ? value : null;
  } catch {
    return null;
  }
}

/** How a contact reads in words: a mail address without its `mailto:`, and a page as it is. */
export function operatorContactText(contact: string): string {
  return contact.startsWith('mailto:') ? decodeURIComponent(contact.slice('mailto:'.length).split('?')[0]) : contact;
}
