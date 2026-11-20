import { existsSync, realpathSync } from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';

import { type AgentFileContent, type AgentToolDefinition, MAX_AGENT_FILE_BYTES } from '@axe/core/agent/agent-tools';

import type { CallOutcome } from './tab-link';

/** The media type a file is handed to the tab with, by its extension. */
const TYPES: Readonly<Record<string, string>> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.webm': 'audio/webm',
  '.glb': 'model/gltf-binary',
  '.zip': 'application/zip',
  '.xml': 'application/xml',
};

/** Why a path is refused, as the AI is told: a path it may give otherwise. */
export class LocalFileRefused extends Error {}

/** Why the files of the person's computer could not be read or written at a path, as the AI is told. */
export class LocalFileFailed extends Error {}

/**
 * What a failure of the file system at a path is answered as: a file come to be where one was to be
 * written, as a path refused; any other, as the file not read or written, its reason told. Anything
 * else, a fault of the bridge's own, is left as it is.
 */
function troubleOf(reason: unknown, path: string, doing: 'read' | 'write'): unknown {
  const code = (reason as NodeJS.ErrnoException | null)?.code;
  if (!(reason instanceof Error) || typeof code !== 'string') return reason;
  if (doing === 'write' && code === 'EEXIST') {
    return new LocalFileRefused(
      `A file came to be at ${path} while the tab worked; nothing was written over it. Give a path with none.`
    );
  }
  return new LocalFileFailed(`Could not ${doing} ${path}: ${reason.message}`);
}

/**
 * The files of the person's computer a call may read or write: only those inside the folder the
 * bridge was told, a link out of it followed and refused, and none written over. Every way the file
 * system fails is answered as a {@link LocalFileRefused} or a {@link LocalFileFailed}.
 */
export class LocalFiles {
  private readonly root: string;

  constructor(root: string) {
    this.root = realpathSync(resolve(root));
  }

  /** The folder files are kept to, as the AI is told of it. */
  get folder(): string {
    return this.root;
  }

  /** Reads a file inside the folder, as it is handed to the tab. */
  async read(path: string): Promise<AgentFileContent> {
    try {
      return await this.readInside(path);
    } catch (reason) {
      throw troubleOf(reason, path, 'read');
    }
  }

  /** Reads a file inside the folder (see {@link read}), the file system's failures left as they are. */
  private async readInside(path: string): Promise<AgentFileContent> {
    const full = this.inside(path);
    if (!existsSync(full)) throw new LocalFileRefused(`There is no file at ${path} in ${this.root}.`);
    const real = realpathSync(full);
    this.within(real, path);
    const facts = await stat(real);
    if (!facts.isFile()) throw new LocalFileRefused(`${path} is not a file.`);
    if (facts.size > MAX_AGENT_FILE_BYTES) {
      throw new LocalFileRefused(`${path} is larger than ${MAX_AGENT_FILE_BYTES} bytes.`);
    }
    const bytes = await readFile(real);
    return {
      name: basename(real),
      type: TYPES[extname(real).toLowerCase()] ?? 'application/octet-stream',
      base64: bytes.toString('base64'),
    };
  }

  /**
   * Refuses a path a file may not be written to: one leading out of the folder, by a link too, one with
   * no folder to go in, or one a file is at already. Run before the tab is asked for the file, so a
   * path refused costs the tab nothing, and again as the file is written.
   */
  checkWritable(path: string): string {
    try {
      return this.writableInside(path);
    } catch (reason) {
      throw troubleOf(reason, path, 'write');
    }
  }

  /** Refuses a path a file may not be written to (see {@link checkWritable}), the file system's failures left as they are. */
  private writableInside(path: string): string {
    const full = this.inside(path);
    if (existsSync(full)) throw new LocalFileRefused(`A file is already at ${path}; give a path with none.`);
    const folder = dirname(full);
    if (!existsSync(folder)) throw new LocalFileRefused(`There is no folder for ${path} in ${this.root}.`);
    this.within(realpathSync(folder), path, true);
    return full;
  }

  /** Writes a file the tab handed back to a path inside the folder, where no file is yet (see {@link checkWritable}); answers where. */
  async write(path: string, file: AgentFileContent): Promise<{ readonly path: string; readonly bytes: number }> {
    const full = this.checkWritable(path);
    const bytes = Buffer.from(file.base64, 'base64');
    try {
      await writeFile(full, bytes, { flag: 'wx' });
    } catch (reason) {
      throw troubleOf(reason, path, 'write');
    }
    return { path: full, bytes: bytes.length };
  }

  /** A path as given, resolved against the folder, refused where it leads out of it. */
  private inside(path: string): string {
    const full = resolve(this.root, path);
    this.within(full, path);
    return full;
  }

  /** Refuses a path that leads out of the folder, or to the folder itself unless that is allowed, as for where a file goes. */
  private within(full: string, path: string, rootAllowed = false): void {
    const step = relative(this.root, full);
    const leaves = step === '..' || step.startsWith(`..${sep}`) || isAbsolute(step);
    if ((step === '' && !rootAllowed) || leaves) {
      throw new LocalFileRefused(`${path} is outside ${this.root}, the folder the bridge was started with.`);
    }
  }
}

/** How a tool is called on the tab: its name, its input, how long it is given, and a signal to give up on it. */
export type ToolCall = (
  tool: string,
  args: Readonly<Record<string, unknown>>,
  timeoutMs: number,
  signal?: AbortSignal
) => Promise<CallOutcome>;

/**
 * A call that reads and writes the files a tool names (see `AgentToolDefinition.localFile`): the file
 * at the path a reading tool is given is read and handed on as `file`, and the `file` a writing tool
 * answers with is written to its path, the answer telling where in its place. A path refused is
 * answered as the AI's mistake, and a file the file system would not read or write as failed, the room
 * the tab made for it not written. Any other call goes on as it is.
 */
export function withLocalFiles(call: ToolCall, files: LocalFiles, tools: readonly AgentToolDefinition[]): ToolCall {
  return async (tool, args, timeoutMs, signal) => {
    const local = tools.find((each) => each.name === tool)?.localFile;
    const path = local ? args[local.arg] : undefined;
    if (!local || typeof path !== 'string' || path.length < 1) return call(tool, args, timeoutMs, signal);
    try {
      if (local.mode === 'read') return await call(tool, { ...args, file: await files.read(path) }, timeoutMs, signal);
      files.checkWritable(path);
      const outcome = await call(tool, args, timeoutMs, signal);
      if (!outcome.ok) return outcome;
      const { file, ...rest } = (outcome.value ?? {}) as { file?: AgentFileContent };
      if (!file) return outcome;
      return { ok: true, value: { ...rest, saved: await files.write(path, file) } };
    } catch (reason) {
      if (reason instanceof LocalFileRefused)
        return { ok: false, error: { code: 'invalid_input', message: reason.message } };
      if (reason instanceof LocalFileFailed) return { ok: false, error: { code: 'failed', message: reason.message } };
      throw reason;
    }
  };
}
