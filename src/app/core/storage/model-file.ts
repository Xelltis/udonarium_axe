import * as FileReaderUtil from '@axe/core/storage/file-reader-util';

/** How much of a model this seat holds: nothing yet, or its bytes. */
export enum ModelState {
  NULL = 0,
  COMPLETE = 1,
}

export interface ModelFileContext {
  identifier: string;
  name: string;
  type: string;
  blob: Blob | null;
  url: string;
}

/** The Content-Type a model is kept and sent under, the one a binary glTF file is served with. */
export const MODEL_TYPE = 'model/gltf-binary';

/**
 * A 3D model for a piece or a block, as one binary glTF (`.glb`) file: its bytes, kept under the
 * SHA-256 of them, and an object URL to load them from. A model is only ever bytes, never a link, so
 * nothing it is drawn from is fetched from anywhere else.
 */
export class ModelFile {
  private context: ModelFileContext = {
    identifier: '',
    name: '',
    blob: null,
    type: '',
    url: '',
  };

  /** The key the model is stored and shared under: the SHA-256 of its bytes. */
  get identifier(): string {
    return this.context.identifier;
  }
  /** The name shown for the model: the file name it was added with, or the identifier when none came with it. */
  get name(): string {
    return this.context.name;
  }
  /** The bytes, or null while this seat holds only a catalogue entry. */
  get blob(): Blob | null {
    return this.context.blob;
  }
  /** An object URL made for the bytes, empty while they have not arrived. */
  get url(): string {
    return this.context.url;
  }
  /** Whether the bytes are here to draw the model from. */
  get isReady(): boolean {
    return this.state !== ModelState.NULL;
  }
  /** How much of the model this seat holds, which the sharing system compares with peers' catalogues. */
  get state(): ModelState {
    return this.context.blob ? ModelState.COMPLETE : ModelState.NULL;
  }

  isHidden: boolean = false;

  private constructor() {}

  /** A placeholder for a model known only from a peer's catalogue, holding the identifier and name until the bytes arrive. */
  static createEmpty(identifier: string, name?: string): ModelFile {
    const model = new ModelFile();
    model.context.identifier = identifier;
    if (name) model.context.name = name;
    return model;
  }

  /** Wraps a context received from a peer. */
  static create(context: ModelFileContext): ModelFile {
    const model = new ModelFile();
    model.apply(context);
    return model;
  }

  /**
   * Reads an added file into a model keyed by the SHA-256 of its bytes, with its object URL ready.
   * A File keeps its name; a bare Blob is named by its hash.
   */
  static async createAsync(blob: Blob): Promise<ModelFile> {
    const name = blob instanceof File ? blob.name : undefined;
    const bytes = await FileReaderUtil.readAsArrayBufferAsync(blob);
    const model = new ModelFile();
    model.context.identifier = await FileReaderUtil.calcSHA256Async(bytes);
    model.context.blob = new Blob([bytes], { type: MODEL_TYPE });
    model.context.type = MODEL_TYPE;
    model.context.url = window.URL.createObjectURL(model.context.blob);
    model.context.name = name ?? model.context.identifier;
    return model;
  }

  /** Revokes the object URL made for the bytes, so it stops holding memory. */
  destroy(): void {
    if (this.context.blob && this.context.url) window.URL.revokeObjectURL(this.context.url);
  }

  /**
   * Fills in what this entry still lacks from another context, as when a transfer from a peer
   * completes. Fields already held are kept, except the name, which any non-empty incoming name
   * replaces.
   */
  apply(context: ModelFileContext): void {
    this.context.identifier ||= context.identifier;
    if (context.name) this.context.name = context.name;
    this.context.blob ??= context.blob;
    this.context.type ||= context.type || (this.context.blob ? MODEL_TYPE : '');
    if (this.context.blob && !this.context.url) this.context.url = window.URL.createObjectURL(this.context.blob);
  }

  /** A shallow copy of the fields, in the shape sent to peers and handed to `apply`. */
  toContext(): ModelFileContext {
    return { ...this.context, url: '' };
  }
}

/** Whether bytes are a binary glTF file, which begins with `glTF` and its version, 2. */
export function isBinaryGltf(head: Uint8Array): boolean {
  return (
    head.length >= 8 &&
    head[0] === 0x67 &&
    head[1] === 0x6c &&
    head[2] === 0x54 &&
    head[3] === 0x46 &&
    head[4] === 2 &&
    head[5] === 0 &&
    head[6] === 0 &&
    head[7] === 0
  );
}
