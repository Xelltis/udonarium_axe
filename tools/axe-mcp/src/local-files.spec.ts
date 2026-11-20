import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { AGENT_TOOLS } from '@axe/core/agent/agent-tools';

import { LocalFiles, withLocalFiles } from './local-files';
import type { CallOutcome } from './tab-link';

/** The code the file system's reads and writes fail with while set, as a disk full or a file locked makes them. */
const failing = vi.hoisted(() => ({ code: null as string | null }));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  const failed = () => Object.assign(new Error(`${failing.code}: refused by the test`), { code: failing.code });
  return {
    ...actual,
    readFile: (...args: Parameters<typeof actual.readFile>) =>
      failing.code ? Promise.reject(failed()) : actual.readFile(...args),
    writeFile: (...args: Parameters<typeof actual.writeFile>) =>
      failing.code ? Promise.reject(failed()) : actual.writeFile(...args),
  };
});

describe('LocalFiles', () => {
  let base: string;
  let root: string;
  let files: LocalFiles;

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), 'axe-mcp-files-'));
    root = join(base, 'kept');
    mkdirSync(join(root, 'art'), { recursive: true });
    writeFileSync(join(root, 'art', 'goblin.png'), Buffer.from([1, 2, 3]));
    writeFileSync(join(base, 'secret.txt'), 'not for the AI');
    files = new LocalFiles(root);
  });

  afterEach(() => rmSync(base, { recursive: true, force: true }));

  it('reads a file inside the folder, with the media type its extension says', async () => {
    expect(await files.read('art/goblin.png')).toEqual({ name: 'goblin.png', type: 'image/png', base64: 'AQID' });
  });

  it('refuses a path, or a link, that leads out of the folder', async () => {
    symlinkSync(join(base, 'secret.txt'), join(root, 'link.txt'));

    await expect(files.read('../secret.txt')).rejects.toThrow(/outside/);
    await expect(files.read(join(base, 'secret.txt'))).rejects.toThrow(/outside/);
    await expect(files.read('link.txt')).rejects.toThrow(/outside/);
    await expect(files.write('../written.zip', { name: 'a', type: 'b', base64: 'AQID' })).rejects.toThrow(/outside/);
  });

  it('writes a new file inside the folder, and none over one already there', async () => {
    const saved = await files.write('art/room.zip', { name: 'room.zip', type: 'application/zip', base64: 'AQID' });

    expect(saved).toEqual({ path: join(files.folder, 'art', 'room.zip'), bytes: 3 });
    expect([...readFileSync(join(root, 'art', 'room.zip'))]).toEqual([1, 2, 3]);
    await expect(files.write('art/goblin.png', { name: 'x', type: 'y', base64: 'AA==' })).rejects.toThrow(/already/);
  });

  it('takes a name beginning with two dots inside the folder as inside it', async () => {
    writeFileSync(join(root, '..notes.png'), Buffer.from([1]));
    mkdirSync(join(root, '..draft'));

    expect((await files.read('..notes.png')).base64).toBe('AQ==');
    expect(files.checkWritable('..draft/map.zip')).toBe(join(files.folder, '..draft', 'map.zip'));
    await expect(files.read('..')).rejects.toThrow(/outside/);
  });
});

describe('withLocalFiles', () => {
  let base: string;
  let files: LocalFiles;

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), 'axe-mcp-calls-'));
    writeFileSync(join(base, 'goblin.png'), Buffer.from([1, 2, 3]));
    files = new LocalFiles(base);
  });

  afterEach(() => rmSync(base, { recursive: true, force: true }));

  it('hands a tool that reads a file the file at its path, and writes the file a saving tool answers with', async () => {
    const seen: Record<string, unknown>[] = [];
    const call = withLocalFiles(
      async (tool, args): Promise<CallOutcome> => {
        seen.push({ tool, ...args });
        return tool === 'save_room'
          ? { ok: true, value: { room: '洞窟', file: { name: 'room.zip', type: 'application/zip', base64: 'AQID' } } }
          : { ok: true, value: {} };
      },
      files,
      AGENT_TOOLS
    );

    await call('import_asset', { path: 'goblin.png' }, 1000);
    const saved = await call('save_room', { path: 'room.zip' }, 1000);
    await call('get_room', { path: 'goblin.png' }, 1000);

    expect(seen[0]).toMatchObject({ tool: 'import_asset', file: { name: 'goblin.png', base64: 'AQID' } });
    expect(saved).toEqual({
      ok: true,
      value: { room: '洞窟', saved: { path: join(files.folder, 'room.zip'), bytes: 3 } },
    });
    expect(seen[2]).toEqual({ tool: 'get_room', path: 'goblin.png' });
  });

  it('answers a path refused as the AI’s mistake, without calling the tab, to read or to write', async () => {
    const tab = vi.fn();
    const call = withLocalFiles(tab, files, AGENT_TOOLS);

    for (const [tool, path, said] of [
      ['import_asset', '../x.png', /outside/],
      ['save_room', '../room.zip', /outside/],
      ['save_room', 'goblin.png', /already/],
      ['save_room', 'nowhere/room.zip', /no folder/],
    ] as const) {
      expect(await call(tool, { path }, 1000), `${tool} ${path}`).toEqual({
        ok: false,
        error: { code: 'invalid_input', message: expect.stringMatching(said) },
      });
    }
    expect(tab).not.toHaveBeenCalled();
  });
});

describe('LocalFiles where the file system fails', () => {
  let base: string;
  let files: LocalFiles;

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), 'axe-mcp-fails-'));
    writeFileSync(join(base, 'goblin.png'), Buffer.from([1, 2, 3]));
    files = new LocalFiles(base);
  });

  afterEach(() => {
    failing.code = null;
    rmSync(base, { recursive: true, force: true });
  });

  it('answers every failure of the file system as a tool failing, a file come to be at the path as a path refused', async () => {
    const tab = vi.fn(async (tool: string): Promise<CallOutcome> =>
      tool === 'save_room'
        ? { ok: true, value: { file: { name: 'room.zip', type: 'application/zip', base64: 'AQID' } } }
        : { ok: true, value: {} }
    );
    const call = withLocalFiles(tab, files, AGENT_TOOLS);

    for (const [tool, path, code, answered] of [
      ['import_asset', 'goblin.png', 'EACCES', 'failed'],
      ['import_asset', 'goblin.png', 'EIO', 'failed'],
      ['save_room', 'room.zip', 'ENOSPC', 'failed'],
      ['save_room', 'room.zip', 'EACCES', 'failed'],
      ['save_room', 'room.zip', 'EEXIST', 'invalid_input'],
    ] as const) {
      failing.code = code;

      expect(await call(tool, { path }, 1000), `${tool} ${code}`).toEqual({
        ok: false,
        error: { code: answered, message: expect.stringContaining(path) },
      });
    }
  });

  it('leaves a fault that is not the file system’s as it is', async () => {
    const call = withLocalFiles(
      async () => {
        throw new TypeError('the bridge itself');
      },
      files,
      AGENT_TOOLS
    );

    await expect(call('import_asset', { path: 'goblin.png' }, 1000)).rejects.toThrow(TypeError);
  });
});
