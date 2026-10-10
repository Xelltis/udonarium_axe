import { TestBed } from '@angular/core/testing';
import { ObjectStore } from '@axe/core/sync/object-store';
import { TextNote } from '@axe/domain/tabletop/text-note';

describe('TextNote', () => {
  let store: ObjectStore;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    store = ObjectStore.instance;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('create()', () => {
    it('is created with a title and a body', () => {
      const note = TextNote.create('メモ', 'テスト内容');
      expect(note).toBeTruthy();
      expect(note.title).toBe('メモ');
      expect(note.text).toBe('テスト内容');
    });

    it('starts at the default type size', () => {
      const note = TextNote.create('t', 'text');
      expect(note.fontSize).toBe(16);
    });

    it('takes a type size', () => {
      const note = TextNote.create('t', 'text', 24);
      expect(note.fontSize).toBe(24);
    });

    it('takes a size of its own', () => {
      const note = TextNote.create('t', 'text', 16, 3, 4);
      expect(note.width).toBe(3);
      expect(note.height).toBe(4);
    });

    it('is created against an identifier of its own', () => {
      const note = TextNote.create('t', 'text', 16, 1, 1, 'note-id');
      expect(note.identifier).toBe('note-id');
    });

    it('is added to the store', () => {
      const note = TextNote.create('t', 'text');
      expect(store.get(note.identifier)).toBe(note);
    });

    it('starts one cell either way', () => {
      const note = TextNote.create('t', 'text');
      expect(note.width).toBe(1);
      expect(note.height).toBe(1);
    });
  });

  describe('aliasName', () => {
    it('names itself a note', () => {
      const note = TextNote.create('t', 'text');
      expect(note.aliasName).toBe('text-note');
    });
  });

  describe('the defaults of the synchronised fields', () => {
    it('starts unlocked', () => {
      const note = TextNote.create('t', 'text');
      expect(note.isLock).toBe(false);
    });

    it('starts unturned', () => {
      const note = TextNote.create('t', 'text');
      expect(note.rotate).toBe(0);
    });

    it('starts at the bottom of the stack', () => {
      const note = TextNote.create('t', 'text');
      expect(note.zindex).toBe(0);
    });

    it('starts without a password', () => {
      const note = TextNote.create('t', 'text');
      expect(note.password).toBe('');
    });

    it('starts standing up', () => {
      const note = TextNote.create('t', 'text');
      expect(note.isUpright).toBe(true);
    });

    it('starts unlimited in height', () => {
      const note = TextNote.create('t', 'text');
      expect(note.limitHeight).toBe(false);
    });
  });

  describe('text setter', () => {
    it('takes new text', () => {
      const note = TextNote.create('t', '初期テキスト');
      note.text = '変更後テキスト';
      expect(note.text).toBe('変更後テキスト');
    });
  });

  describe('how its body is drawn', () => {
    it('is drawn as it was typed until it is set otherwise, and reads anything but formatted that way', () => {
      const note = TextNote.create('t', '# 見出し');
      expect(note.isFormatted).toBe(false);

      note.isFormatted = true;
      expect(note.textFormat).toBe('formatted');
      expect(note.text).toBe('# 見出し');

      note.textFormat = 'from-a-newer-version';
      expect(note.isFormatted).toBe(false);

      note.isFormatted = false;
      expect(note.textFormat).toBe('');
    });
  });

  describe('what it inherits', () => {
    it('starts on the table', () => {
      const note = TextNote.create('t', 'text');
      expect(note.location.name).toBe('table');
    });
  });
});
