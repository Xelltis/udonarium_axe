import { computed, effect, inject, Injectable, InjectionToken, type Signal, signal, untracked } from '@angular/core';
import { ImageService } from '@axe/application/storage/image.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { PieceLinksService } from '@axe/application/tabletop/piece-links.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { loadImage } from '@axe/core/util/load-image';
import { GameCharacter } from '@axe/domain/character/game-character';
import {
  isPartLost,
  joinedPartFaces,
  partFacesOn,
  type PartLayer,
  partLayerOf,
  type PartMask,
  partMaskOf,
  writePartFaces,
} from '@axe/domain/character/part-look';
import { collectDataElements } from '@axe/domain/data/data-element-tree';

/** A picture drawn for a piece, and how large it is. */
export interface PartPicture {
  readonly url: string;
  readonly width: number;
  readonly height: number;
}

/** A part as a body's picture is drawn with it. */
export interface PartLookToDraw {
  readonly url: string;
  readonly layer: PartLayer | null;
  readonly mask: PartMask | null;
  readonly lost: boolean;
}

/** What is kept for a piece, with the piece it was made for. */
interface KeptFor<T> {
  readonly body: GameCharacter;
  readonly value: Signal<T>;
}

/** A part's look along with its piece of the picture as written down, which keys the picture cheaply. */
type PartLookWritten = PartLookToDraw & { readonly maskWritten: string };

/**
 * How a body's picture is drawn with its parts: from the body's own picture and the parts' looks, a
 * picture of its own the caller lets go of once it is done with it, or null where it cannot be drawn.
 */
export const PART_PICTURE_DRAWER = new InjectionToken<
  (own: string, looks: readonly PartLookToDraw[]) => Promise<PartPicture | null>
>('PART_PICTURE_DRAWER', { providedIn: 'root', factory: () => drawWithParts });

/** What a body's parts stand for of its model; see `PiecePartPicturesService.modelFacesOf`. */
export interface PartModelFaces {
  readonly painted: boolean;
  readonly cut: string;
}

/** How long a body's picture made with its parts is kept once a newer one takes its place, for what still reads it. */
const REPLACED_PICTURE_KEPT_MS = 5000;

/** The longest side a body's picture is drawn at with its parts, in pixels, however large its own. */
const LONGEST_SIDE_PX = 1024;

/** A body's picture drawn with its parts, and the one being made in its place. */
interface Drawn {
  key: string;
  picture: PartPicture | null;
  making: string | null;
}

/**
 * The pictures of the pieces that have parts laid over or cut out of their own: the body's picture
 * with each part's picture laid over it, behind or in front by its order, and the piece each lost
 * part stands for cut out of it. A lost part's own picture is not laid. Made once the pictures it
 * takes in are read, and made again as the parts change; a piece with no such parts has none.
 */
@Injectable({ providedIn: 'root' })
export class PiecePartPicturesService {
  private readonly links = inject(PieceLinksService);
  private readonly images = inject(ImageService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly objectStore = inject(ObjectStore);
  private readonly draw = inject(PART_PICTURE_DRAWER);
  private readonly drawn = new Map<string, Drawn>();
  /** Moves on as each picture is made, for whatever drew a piece before its picture came. */
  private readonly made = signal(0);

  constructor() {
    // A piece taken out of the room is drawn no more: what was kept for it, its picture with it, goes.
    effect(() => {
      this.objectChange.collectionOf(GameCharacter.aliasName)();
      untracked(() => this.forgetTheGone());
    });
  }

  /** Lets go of everything kept for pieces no longer in the room. */
  private forgetTheGone(): void {
    const ids = new Set([...this.drawn.keys(), ...this.keys.keys(), ...this.faces.keys()]);
    for (const id of ids) {
      if (this.objectStore.get(id)) continue;
      this.forget(id);
      this.keys.delete(id);
      this.faces.delete(id);
    }
  }

  /**
   * What is kept for a piece by its identifier, made anew where none is kept or it was made for
   * another piece under the same identifier, one taken out of the room and put back as a new object.
   */
  private keptFor<T>(kept: Map<string, KeptFor<T>>, body: GameCharacter, make: () => Signal<T>): Signal<T> {
    let held = kept.get(body.identifier);
    if (!held || held.body !== body) {
      held = { body, value: make() };
      kept.set(body.identifier, held);
    }
    return held.value;
  }

  /**
   * What each piece's parts lay over and cut out of its picture, by the piece, as a key that is the
   * same as long as they are: worked out apart from the drawing of the piece, so that a change to
   * any piece, which any may come to be a part of another by, draws the piece again only where its
   * parts' look changed. Each follows the parts the links work out once for all.
   */
  private readonly keys = new Map<string, KeptFor<string>>();

  /**
   * The picture a piece is drawn with, its parts laid over and cut out of its own, or null where it
   * has none such, or while the first is still being made. Follows the parts, so it is asked for
   * again as they change.
   */
  pictureOf(body: GameCharacter): PartPicture | null {
    const key = this.keyOf(body)();
    if (!key) {
      this.forget(body.identifier);
      return null;
    }
    // Only a piece with such parts hears of the pictures made, so the rest are not drawn again for them.
    this.made();
    let drawn = this.drawn.get(body.identifier);
    if (drawn && (drawn.key === key || drawn.making === key)) return drawn.picture;
    if (!drawn) {
      drawn = { key: '', picture: null, making: null };
      this.drawn.set(body.identifier, drawn);
    }
    const held = drawn;
    held.making = key;
    const { own, looks } = untracked(() => this.looksOf(body));
    // The picture made last is drawn on until the new one is made, so nothing flickers meanwhile.
    void this.draw(own, looks).then(
      (picture) => {
        if (this.drawn.get(body.identifier) !== held || held.making !== key) {
          if (picture) URL.revokeObjectURL(picture.url);
          return;
        }
        const before = held.picture;
        held.picture = picture;
        held.key = key;
        held.making = null;
        // The table may still be reading the picture before it, so it is let go of a while later.
        if (before) setTimeout(() => URL.revokeObjectURL(before.url), REPLACED_PICTURE_KEPT_MS);
        this.made.update((count) => count + 1);
      },
      () => {
        if (held.making === key) held.making = null;
      }
    );
    return held.picture;
  }

  /** The key of what a piece's parts lay over and cut out of its picture, empty for nothing. */
  private keyOf(body: GameCharacter): Signal<string> {
    return this.keptFor(this.keys, body, () =>
      computed(() => {
        this.objectChange.fileVersion();
        this.objectChange.versionOf(body.identifier)();
        const { own, looks } = this.looksOf(body);
        if (!own || looks.length < 1) return '';
        return (
          JSON.stringify([own, looks.map((look) => [look.url, look.layer, look.lost, look.mask ? 1 : 0])]) +
          looks.map((look) => (look.mask ? look.maskWritten : '')).join('|')
        );
      })
    );
  }

  private readonly faces = new Map<string, KeptFor<PartModelFaces>>();

  /**
   * What a piece's parts stand for of its model: whether any part is painted over it, which has it
   * drawn as a copy of its own to be picked by its faces, and the faces of the lost parts, written as
   * `writePartFaces` writes them, which the copy leaves out. Follows the parts as `pictureOf` does.
   */
  modelFacesOf(body: GameCharacter): PartModelFaces {
    const faces = this.keptFor(this.faces, body, () =>
      computed(
        () => {
          this.objectChange.versionOf(body.identifier)();
          const parts = this.links
            .followedPartsOf(body)
            .map((part) => ({ faces: partFacesOn(part, body), lost: this.lookOf(part).lost }))
            .filter((part) => part.faces.size > 0);
          return {
            painted: parts.length > 0,
            cut: writePartFaces(joinedPartFaces(parts.filter((part) => part.lost).map((part) => part.faces))),
          };
        },
        { equal: (a, b) => a.painted === b.painted && a.cut === b.cut }
      )
    );
    return faces();
  }

  /** A piece's own picture, and the looks of the parts that lay anything over or cut anything out of it. */
  private looksOf(body: GameCharacter): { own: string; looks: PartLookWritten[] } {
    return {
      own: this.images.getEmptyOr(body.imageFile).url,
      looks: this.links
        .followedPartsOf(body)
        .map((part) => this.lookOf(part))
        .filter((look) => look.layer !== null || look.mask !== null),
    };
  }

  private lookOf(part: GameCharacter): PartLookWritten {
    this.objectChange.versionOf(part.identifier)();
    const detail = part.detailDataElement ?? null;
    if (detail) {
      this.objectChange.versionOf(detail.identifier)();
      for (const element of collectDataElements(detail)) this.objectChange.versionOf(element.identifier)();
    }
    return {
      url: this.images.getEmptyOr(part.imageFile).url,
      layer: partLayerOf(part.partLayer),
      mask: partMaskOf(part.partMask),
      maskWritten: part.partMask,
      lost: isPartLost(part),
    };
  }

  /**
   * Lets go of what was kept for a piece, its picture a while later, as the table may still be
   * reading it in the frame it is drawn without its parts in, as it is when one is replaced.
   */
  private forget(identifier: string): void {
    const known = this.drawn.get(identifier);
    if (!known) return;
    this.drawn.delete(identifier);
    const picture = known.picture;
    if (picture) setTimeout(() => URL.revokeObjectURL(picture.url), REPLACED_PICTURE_KEPT_MS);
  }
}

/**
 * Reads a picture, or answers null where it cannot be read. One from another site is asked for
 * across origins, as the canvas it is drawn on is read back; one that site will not share is drawn
 * without, as one that cannot be read.
 */
function read(url: string): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  const options = /^https?:/i.test(url) ? { crossOrigin: 'anonymous' } : {};
  return loadImage(url, options).catch(() => null);
}

/**
 * Draws a body's picture with its parts: the pictures laid behind it, it with the pieces of the lost
 * parts cut out, softly at their edges, and the pictures laid over it, each by its order.
 */
async function drawWithParts(own: string, looks: readonly PartLookToDraw[]): Promise<PartPicture | null> {
  const body = await read(own);
  if (!body || !(body.naturalWidth > 0) || !(body.naturalHeight > 0)) return null;
  const scale = Math.min(1, LONGEST_SIDE_PX / Math.max(body.naturalWidth, body.naturalHeight));
  const width = Math.max(1, Math.round(body.naturalWidth * scale));
  const height = Math.max(1, Math.round(body.naturalHeight * scale));
  const laid = await Promise.all(
    looks
      .filter((look) => look.layer && !look.lost)
      .map(async (look) => ({ layer: look.layer!, image: await read(look.url) }))
  );

  const cut = document.createElement('canvas');
  cut.width = width;
  cut.height = height;
  const cutContext = cut.getContext('2d');
  if (!cutContext) return null;
  cutContext.drawImage(body, 0, 0, width, height);
  for (const look of looks) {
    if (!look.lost || !look.mask) continue;
    cutContext.globalCompositeOperation = 'destination-out';
    cutContext.imageSmoothingEnabled = true;
    cutContext.drawImage(maskCanvasOf(look.mask), 0, 0, width, height);
  }
  cutContext.globalCompositeOperation = 'source-over';

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const layOn = (image: HTMLImageElement, layer: PartLayer) => {
    if (!(image.naturalWidth > 0)) return;
    const w = layer.width * width;
    const h = (w * image.naturalHeight) / image.naturalWidth;
    context.drawImage(image, layer.x * width - w / 2, layer.y * height - h / 2, w, h);
  };
  const sorted = laid.filter((one) => one.image).sort((a, b) => a.layer.order - b.layer.order);
  for (const one of sorted) if (one.layer.order <= 0) layOn(one.image!, one.layer);
  context.drawImage(cut, 0, 0);
  for (const one of sorted) if (one.layer.order > 0) layOn(one.image!, one.layer);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  return blob ? { url: URL.createObjectURL(blob), width, height } : null;
}

/** A part's piece of the picture as a picture: opaque where it is painted, clear elsewhere. */
function maskCanvasOf(mask: PartMask): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = mask.size;
  canvas.height = mask.size;
  const context = canvas.getContext('2d')!;
  const pixels = context.createImageData(mask.size, mask.size);
  for (let at = 0; at < mask.cells.length; at++) pixels.data[at * 4 + 3] = mask.cells[at] ? 255 : 0;
  context.putImageData(pixels, 0, 0);
  return canvas;
}
