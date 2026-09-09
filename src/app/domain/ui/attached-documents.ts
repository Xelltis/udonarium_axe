/**
 * Every document the app is currently drawing into.
 *
 * A panel taken out into a window of its own is still the same component in the same
 * application; only its nodes live somewhere else. Anything written onto the document
 * itself — the theme's classes, a skin's colours — has to be written onto all of them, or
 * the panel that left comes out undressed.
 *
 * The main document is always in the set and is never removed.
 */
export class AttachedDocuments {
  private static readonly attached = new Set<Document>();
  private static readonly listeners = new Set<(documents: readonly Document[]) => void>();

  /** Puts the document the app started in at the head of the set. */
  static begin(main: Document): void {
    AttachedDocuments.attached.add(main);
    AttachedDocuments.tell();
  }

  static attach(document: Document): void {
    if (AttachedDocuments.attached.has(document)) return;
    AttachedDocuments.attached.add(document);
    AttachedDocuments.tell();
  }

  static detach(document: Document): void {
    if (!AttachedDocuments.attached.delete(document)) return;
    AttachedDocuments.tell();
  }

  static all(): readonly Document[] {
    return [...AttachedDocuments.attached];
  }

  /** Calls back whenever a window opens or closes, so what is painted stays painted. */
  static onChange(listener: (documents: readonly Document[]) => void): () => void {
    AttachedDocuments.listeners.add(listener);
    listener(AttachedDocuments.all());
    return () => AttachedDocuments.listeners.delete(listener);
  }

  /** Forgets every window but the one given, for a test starting over. */
  static reset(main?: Document): void {
    AttachedDocuments.attached.clear();
    AttachedDocuments.listeners.clear();
    if (main) AttachedDocuments.attached.add(main);
  }

  private static tell(): void {
    const documents = AttachedDocuments.all();
    for (const listener of AttachedDocuments.listeners) listener(documents);
  }
}
