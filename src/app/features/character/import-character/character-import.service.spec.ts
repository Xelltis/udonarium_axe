import { TestBed } from '@angular/core/testing';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { DisclosureMode } from '@axe/domain/disclosure/disclosure';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { CharacterImportService } from '@axe/features/character/import-character/character-import.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

const WAREHOUSE_URL = 'https://character-sheets.appspot.com/sw2.5/edit.html?key=abc';
const ARCHIVE_URL = 'https://charasheet.vampire-blood.net/12345';

function piece(over: Record<string, unknown> = {}): { kind: string; data: Record<string, unknown> } {
  return { kind: 'character', data: { name: '探索者A', status: [{ label: 'HP', value: 8, max: 12 }], ...over } };
}

function answer(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    blob: async () => new Blob(['picture'], { type: 'image/png' }),
  } as Response;
}

describe('CharacterImportService', () => {
  let service: CharacterImportService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    service = TestBed.inject(CharacterImportService);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /** Keeps script tags from being loaded, and hands back the ones the service put in the page. */
  function holdScripts(): HTMLScriptElement[] {
    const scripts: HTMLScriptElement[] = [];
    const append = document.body.appendChild.bind(document.body);
    vi.spyOn(document.body, 'appendChild').mockImplementation(<T extends Node>(node: T): T => {
      if (node instanceof HTMLScriptElement) {
        scripts.push(node);
        return node;
      }
      return append(node);
    });
    return scripts;
  }

  const callbackOf = (script: HTMLScriptElement) => new URL(script.src).searchParams.get('callback') ?? '';
  const globals = () => window as unknown as Record<string, ((data: unknown) => void) | undefined>;

  describe('pasted json', () => {
    it('builds a piece owned by the reader from a sheet it knows', async () => {
      const result = await service.importFromText(JSON.stringify(piece()));

      try {
        expect(result.error).toBeNull();
        expect(result.service).toBe('ccfolia');
        expect(result.character?.name).toBe('探索者A');
        expect(result.character?.owner).toBe(PeerCursor.myCursor?.userId ?? '');
        expect(result.imageResolved).toBe(false);
        expect(result.systemUnknown).toBe(false);
      } finally {
        result.character?.destroy();
      }
    });

    it('starts the piece of a game master shown to game masters only', async () => {
      vi.spyOn(PeerCursor, 'isMyselfGameMaster', 'get').mockReturnValue(true);

      const result = await service.importFromText(JSON.stringify(piece()));

      try {
        expect(result.character?.disclosureMode).toBe(DisclosureMode.GameMaster);
      } finally {
        result.character?.destroy();
      }
    });

    it('says the text could not be fetched where it is not json at all', async () => {
      await expect(service.importFromText('not json')).resolves.toEqual({
        character: null,
        error: 'fetch-failed',
        imageResolved: false,
        service: 'json',
        systemUnknown: false,
      });
    });

    it('says the sheet is not one it knows for json of another shape', async () => {
      const result = await service.importFromText('{"foo":"bar"}');

      expect(result).toMatchObject({ character: null, error: 'unrecognized', service: 'json' });
    });
  });

  describe('an address', () => {
    it('turns away a service it does not read, without fetching anything', async () => {
      const fetched = vi.spyOn(globalThis, 'fetch');

      const result = await service.importFromText('https://charaxiv.app/c/abc');

      expect(result).toMatchObject({ character: null, error: 'unsupported', service: 'charaxiv' });
      expect(fetched).not.toHaveBeenCalled();
    });

    it('fetches the sheet of a service that allows it', async () => {
      const fetched = vi.spyOn(globalThis, 'fetch').mockResolvedValue(answer(piece()));

      const result = await service.importFromText(ARCHIVE_URL);

      try {
        expect(fetched).toHaveBeenCalledWith('https://charasheet.vampire-blood.net/12345.js');
        expect(result.error).toBeNull();
        expect(result.character?.name).toBe('探索者A');
      } finally {
        result.character?.destroy();
      }
    });

    it('says the fetch failed for an answer that is not ok, or none at all, naming the service', async () => {
      const fetched = vi.spyOn(globalThis, 'fetch').mockResolvedValue(answer('', false));
      await expect(service.importFromText(ARCHIVE_URL)).resolves.toMatchObject({
        error: 'fetch-failed',
        service: 'charasheet',
      });

      fetched.mockRejectedValue(new TypeError('offline'));
      await expect(service.importFromText(ARCHIVE_URL)).resolves.toMatchObject({
        error: 'fetch-failed',
        service: 'charasheet',
      });
    });
  });

  describe('an address fetched through a script tag', () => {
    it('reads what the callback is handed, and clears the tag and the callback away', async () => {
      const scripts = holdScripts();
      const importing = service.importFromText(WAREHOUSE_URL);
      const script = scripts[0];
      const name = callbackOf(script);
      const removed = vi.spyOn(script, 'remove');

      expect(script.src).toContain('https://character-sheets.appspot.com/sw2.5/display?ajax=1');
      globals()[name]?.(piece());
      const result = await importing;

      try {
        expect(result.error).toBeNull();
        expect(result.character?.name).toBe('探索者A');
        expect(globals()[name]).toBeUndefined();
        expect(removed).toHaveBeenCalledTimes(1);
      } finally {
        result.character?.destroy();
      }
    });

    it('says the fetch failed where the script cannot be loaded', async () => {
      const scripts = holdScripts();
      const importing = service.importFromText(WAREHOUSE_URL);
      const name = callbackOf(scripts[0]);

      scripts[0].onerror?.(new Event('error'));

      await expect(importing).resolves.toMatchObject({ error: 'fetch-failed', service: 'appspot' });
      expect(globals()[name]).toBeUndefined();
    });

    it('gives up after fifteen seconds without an answer', async () => {
      vi.useFakeTimers();
      const scripts = holdScripts();
      const importing = service.importFromText(WAREHOUSE_URL);
      const name = callbackOf(scripts[0]);
      let settled = false;
      void importing.then(() => (settled = true));

      await vi.advanceTimersByTimeAsync(14_999);
      expect(settled).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      await expect(importing).resolves.toMatchObject({ error: 'fetch-failed', service: 'appspot' });
      expect(globals()[name]).toBeUndefined();
    });
  });

  describe('the portrait', () => {
    it('is fetched and kept, and the piece wears it', async () => {
      const fetched = vi.spyOn(globalThis, 'fetch').mockResolvedValue(answer(''));
      const add = vi
        .spyOn(TestBed.inject(ImageStorage), 'addAsync')
        .mockResolvedValue({ identifier: 'portrait-1' } as Awaited<ReturnType<ImageStorage['addAsync']>>);

      const result = await service.importFromText(JSON.stringify(piece({ iconUrl: ' https://example.com/icon.png ' })));

      try {
        expect(fetched).toHaveBeenCalledWith('https://example.com/icon.png');
        expect(add).toHaveBeenCalledWith(expect.any(Blob), { putBack: true });
        expect(result.imageResolved).toBe(true);
        expect(result.character?.imageDataElement?.getFirstElementByName('imageIdentifier')?.value).toBe('portrait-1');
      } finally {
        result.character?.destroy();
      }
    });

    it('is left out where it cannot be fetched, and the piece is built all the same', async () => {
      const fetched = vi.spyOn(globalThis, 'fetch').mockResolvedValue(answer('', false));
      const first = await service.importFromText(JSON.stringify(piece({ iconUrl: 'https://example.com/icon.png' })));
      fetched.mockRejectedValue(new TypeError('offline'));
      const second = await service.importFromText(JSON.stringify(piece({ iconUrl: 'https://example.com/icon.png' })));

      try {
        expect([first.error, second.error]).toEqual([null, null]);
        expect([first.imageResolved, second.imageResolved]).toEqual([false, false]);
        expect(first.character).not.toBeNull();
        expect(second.character).not.toBeNull();
      } finally {
        first.character?.destroy();
        second.character?.destroy();
      }
    });

    it('is not fetched for a sheet that names none', async () => {
      const fetched = vi.spyOn(globalThis, 'fetch');

      const result = await service.importFromText(JSON.stringify(piece()));

      expect(fetched).not.toHaveBeenCalled();
      result.character?.destroy();
    });
  });
});
