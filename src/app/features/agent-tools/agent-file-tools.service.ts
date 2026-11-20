import { inject, Injectable } from '@angular/core';
import type { AgentHandler } from '@axe/application/agent/agent-tool-runner.service';
import { CharacterImportService } from '@axe/application/character/character-import.service';
import { RoomFilesService } from '@axe/application/file/room-files.service';
import { RoomSnapshotService } from '@axe/application/file/room-snapshot.service';
import { SaveDataService } from '@axe/application/file/save-data.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { AgentToolError } from '@axe/core/agent/agent-error';
import { type AgentFileContent, MAX_AGENT_FILE_BYTES } from '@axe/core/agent/agent-tools';
import { Network } from '@axe/core/network/network';
import { isNetworkIsolated } from '@axe/core/network/network-isolation';
import { FileArchiver } from '@axe/core/storage/file-archiver';
import { decodeBytes, encodeBytes } from '@axe/core/util/base64-bytes';
import { textArg } from '@axe/features/agent-tools/agent-lookup';

/** How long the person at the seat is given to agree to a room an AI asks to load. */
const AGREE_WITHIN_MS = 60_000;

/** A file named as the room saves name a stored picture, whose name it would be taken in under unread. */
const STORED_NAME = /^[0-9a-f]{64}\./i;

/** Room data, which `load_room` puts in and `import_asset` never does. */
const ROOM_DATA = /\.(zip|xml)$/i;

/** A number of bytes in megabytes, to one decimal place. */
function megabytes(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

/** What a failed character import is told as. */
const IMPORT_FAILURES: Readonly<Record<string, string>> = {
  unrecognized: 'The text is neither the address of a sheet on a site the import knows nor a sheet it can read.',
  unsupported: 'Sheets of that site cannot be taken in.',
  'fetch-failed': 'The sheet could not be read from its site.',
  failed: 'The sheet could not be taken in.',
};

/** The bytes of a file the bridge read, ready to be made a File of. */
function bytesOf(file: AgentFileContent): Uint8Array<ArrayBuffer> {
  const decoded = decodeBytes(file.base64);
  const bytes = new Uint8Array(new ArrayBuffer(decoded.length));
  bytes.set(decoded);
  return bytes;
}

/**
 * The AI link's tools for files: taking in a picture, a sound or a model, saving the room to a file or
 * a snapshot, putting a saved room back, and taking in a character sheet, each as the screen's own
 * hand does it. The bridge reads and writes the files on the person's computer, kept to a folder it
 * was told; the tab sees only the bytes. A room put in place of the one in play is asked about on the
 * seat's screen first.
 */
@Injectable({ providedIn: 'root' })
export class AgentFileTools {
  private readonly fileArchiver = inject(FileArchiver);
  private readonly saveData = inject(SaveDataService);
  private readonly roomFiles = inject(RoomFilesService);
  private readonly snapshots = inject(RoomSnapshotService);
  private readonly confirm = inject(ConfirmService);
  private readonly characters = inject(CharacterImportService);
  private readonly t = inject(TRANSLATE_FN);

  readonly handlers: Readonly<Record<string, AgentHandler>> = {
    import_asset: (args) => this.importAsset(args),
    save_room: (args) => this.saveRoom(args),
    save_room_snapshot: () => this.saveSnapshot(),
    list_room_snapshots: () => this.listSnapshots(),
    load_room: (args, { signal }) => this.loadRoom(args, signal),
    import_character: (args) => this.importCharacter(args),
  };

  private async importAsset(args: Readonly<Record<string, unknown>>): Promise<unknown> {
    const given = this.fileOf(args);
    if (ROOM_DATA.test(given.name)) {
      throw new AgentToolError('invalid_input', `${given.name} is room data; load_room puts a saved room in.`);
    }
    const name = STORED_NAME.test(given.name) ? `asset-${given.name}` : given.name;
    const file = new File([bytesOf(given)], name, { type: given.type });
    const taken = await this.fileArchiver.loadAssets([file]);
    if (taken.tooLarge.length > 0) {
      throw new AgentToolError(
        'failed',
        `${given.name} is larger than the room takes in, or a model with too many triangles.`
      );
    }
    if (taken.images.length + taken.audios.length + taken.models.length < 1) {
      throw new AgentToolError(
        'invalid_input',
        `${given.name} is no picture, sound or .glb model the room can take in.`
      );
    }
    return { images: taken.images, sounds: taken.audios, models: taken.models };
  }

  private async saveRoom(args: Readonly<Record<string, unknown>>): Promise<unknown> {
    if (isNetworkIsolated())
      throw new AgentToolError('failed', 'A recording is shown in place of the table; nothing is saved.');
    const blob =
      args['everything'] === true
        ? await this.saveData.createWholeRoomArchiveAsync()
        : await this.saveData.createRoomArchiveAsync();
    if (blob.size > MAX_AGENT_FILE_BYTES) {
      throw new AgentToolError(
        'failed',
        `The room comes to ${megabytes(blob.size)} MB, more than the ${megabytes(MAX_AGENT_FILE_BYTES)} MB the bridge takes at once. ` +
          'Save it without everything, or from the room’s own save menu.'
      );
    }
    const file: AgentFileContent = {
      name: 'room.zip',
      type: 'application/zip',
      base64: encodeBytes(new Uint8Array(await blob.arrayBuffer())),
    };
    return { file, room: Network.peerContext?.roomName ?? '' };
  }

  private async saveSnapshot(): Promise<unknown> {
    const taken = await this.snapshots.capture();
    if (!taken)
      throw new AgentToolError('failed', 'No snapshot was taken: this browser keeps none, or one is being taken.');
    return { number: taken.id, at: new Date(taken.savedAt).toISOString(), room: taken.roomName };
  }

  private async listSnapshots(): Promise<unknown> {
    const listed = await this.snapshots.refresh();
    return listed.map((meta) => ({
      number: meta.id,
      at: new Date(meta.savedAt).toISOString(),
      room: meta.roomName,
      bytes: meta.byteSize,
    }));
  }

  /**
   * Puts a saved room in place of the one in play, once the person at the seat agrees on their screen:
   * a minute is given, and an answer not given, or a call the AI gave up on, loads nothing.
   */
  private async loadRoom(args: Readonly<Record<string, unknown>>, signal: AbortSignal): Promise<unknown> {
    const snapshot = typeof args['snapshot'] === 'number' ? args['snapshot'] : null;
    const hasFile = args['file'] !== undefined;
    if ((snapshot === null) === !hasFile)
      throw new AgentToolError('invalid_input', 'Give exactly one of path or snapshot.');
    let file: File | null = null;
    let withheld = false;
    if (hasFile) {
      const given = this.fileOf(args);
      file = new File([bytesOf(given)], given.name, { type: 'application/zip' });
      const room = await this.fileArchiver.roomIn(file);
      if (!room) throw new AgentToolError('invalid_input', `${given.name} is no saved room.`);
      withheld = room.withheld;
    }
    if (!(await this.agreed(withheld, signal))) {
      throw new AgentToolError('not_allowed', 'The person at the seat did not agree to load the room.');
    }
    const loaded = file
      ? await this.roomFiles.loadAgreed(file)
      : await this.snapshots.restore(snapshot!, { agreed: true });
    if (!loaded) throw new AgentToolError('failed', 'The room could not be read.');
    return { loaded: true };
  }

  /** Asks the person at the seat whether the room an AI asks for may go in, for a minute at most. */
  private async agreed(withheld: boolean, signal: AbortSignal): Promise<boolean> {
    const asking = new AbortController();
    const timer = setTimeout(() => asking.abort(), AGREE_WITHIN_MS);
    const giveUp = () => asking.abort();
    signal.addEventListener('abort', giveUp, { once: true });
    try {
      const message =
        this.t('feature.aiLink.loadRoom.ask') + (withheld ? `\n\n${this.t('feature.aiLink.loadRoom.withheld')}` : '');
      return await this.confirm.ask({ title: this.t('feature.aiLink.loadRoom.title'), message }, asking.signal);
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', giveUp);
    }
  }

  private async importCharacter(args: Readonly<Record<string, unknown>>): Promise<unknown> {
    const url = textArg(args, 'url').trim();
    const text = textArg(args, 'text').trim();
    if (!url === !text) throw new AgentToolError('invalid_input', 'Give exactly one of url or text.');
    const result = await this.characters.importFromText(url || text);
    if (!result.character) {
      throw new AgentToolError('failed', IMPORT_FAILURES[result.error ?? 'failed'] ?? IMPORT_FAILURES['failed']);
    }
    return {
      piece: { id: result.character.identifier, name: result.character.name },
      from: result.service,
      picture: result.imageResolved,
      ...(result.systemUnknown
        ? { note: 'The sheet names no game system; what depends on one was read as far as it could be.' }
        : {}),
    };
  }

  /** The file the bridge read from the path the AI gave. */
  private fileOf(args: Readonly<Record<string, unknown>>): AgentFileContent {
    const file = args['file'] as AgentFileContent | undefined;
    if (!file) throw new AgentToolError('invalid_input', 'Give the path of the file.');
    return file;
  }
}
