import { AttachedDocuments } from '@axe/domain/ui/attached-documents';

function otherDocument(): Document {
  return document.implementation.createHTMLDocument('other');
}

describe('the documents the app is drawing into', () => {
  beforeEach(() => AttachedDocuments.reset(document));
  afterEach(() => AttachedDocuments.reset(document));

  it('starts with the one the app opened in', () => {
    expect(AttachedDocuments.all()).toEqual([document]);
  });

  it('takes in a window that opens, and lets go of one that closes', () => {
    const other = otherDocument();

    AttachedDocuments.attach(other);
    expect(AttachedDocuments.all()).toContain(other);

    AttachedDocuments.detach(other);
    expect(AttachedDocuments.all()).not.toContain(other);
  });

  it('counts the same document once however often it is announced', () => {
    const other = otherDocument();

    AttachedDocuments.attach(other);
    AttachedDocuments.attach(other);

    expect(AttachedDocuments.all().length).toBe(2);
  });

  it('tells a listener what there is now, and again whenever it changes', () => {
    const seen: number[] = [];
    const stop = AttachedDocuments.onChange((documents) => seen.push(documents.length));
    const other = otherDocument();

    AttachedDocuments.attach(other);
    AttachedDocuments.detach(other);

    expect(seen).toEqual([1, 2, 1]);
    stop();
  });

  it('says nothing to a listener that has been let go', () => {
    const seen: number[] = [];
    const stop = AttachedDocuments.onChange((documents) => seen.push(documents.length));
    stop();

    AttachedDocuments.attach(otherDocument());

    expect(seen).toEqual([1]);
  });

  it('says nothing when told to let go of something it never held', () => {
    const seen: number[] = [];
    const stop = AttachedDocuments.onChange((documents) => seen.push(documents.length));

    AttachedDocuments.detach(otherDocument());

    expect(seen).toEqual([1]);
    stop();
  });
});
