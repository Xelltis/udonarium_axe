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

/** Why a path is refused, as the AI is told. */
export class LocalFileRefused extends Error {}

/**
 * The files of the person's computer a call may read or write: only those inside the folder the
 * bridge was told, a link out of it followed and refused, and none written over.
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
    await writeFile(full, bytes, { flag: 'wx' });
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
 * answers with is written to its path, the answer telling where in its place. Any other call goes on
 * as it is.
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
      if (!(reason instanceof LocalFileRefused)) throw reason;
      return { ok: false, error: { code: 'invalid_input', message: reason.message } };
    }
  };
}
