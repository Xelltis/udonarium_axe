import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { portraitPicturesOf } from '@axe/domain/character/character-portrait';
import { GameCharacter } from '@axe/domain/character/game-character';
import {
  type CutInPortraitFit,
  movePortraitFit,
  PORTRAIT_FIT_FRAME,
  portraitFitFor,
  portraitFitTransform,
  WHOLE_PORTRAIT_FIT,
  withPortraitFits,
  zoomPortraitFit,
} from '@axe/domain/media/cut-in-portrait-fit';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { TranslocoModule } from '@jsverse/transloco';

/** What the sheet opens the dialog with: whose portraits, and which of them to start on. */
export interface CutInPortraitFitDialogOption {
  readonly characterIdentifier: string;
  readonly pictureIdentifier: string;
}

/** The space round the slot, where what the slot cuts off shows dimmed. */
export const PORTRAIT_FIT_MARGIN = 40;
const MIN_FRAME_WIDTH = 170;
/** How far one press of an arrow key moves the portrait, as a share of the slot; more with shift. */
const KEY_STEP = 0.01;
const KEY_STEP_LARGE = 0.05;
const ZOOM_STEP = 1.1;

/** The width of the slot for a viewport width: the sheet's usual slot, smaller where the screen is. */
export function portraitFitFrameWidth(viewportWidth: number): number {
  return Math.max(MIN_FRAME_WIDTH, Math.min(PORTRAIT_FIT_FRAME.width, viewportWidth - PORTRAIT_FIT_MARGIN * 2 - 48));
}

/**
 * Sets how each of a character's portraits sits in a cut-in's portrait slot: dragged into place,
 * grown and shrunk with the wheel, a pinch or the keys, over a head-and-shoulders slot with what it
 * cuts off dimmed round it.
 *
 * Nothing is written until the dialog is closed with its button, and then once for every portrait
 * changed, so a drag sends one change to the room rather than one for every move. A portrait put
 * back is left to each cut-in's own framing again.
 */
@Component({
  selector: 'cut-in-portrait-fit-dialog',
  templateUrl: './cut-in-portrait-fit-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SafePipe, TranslocoModule],
  host: { class: 'block text-ui-text' },
})
export class CutInPortraitFitDialogComponent {
  private readonly modalService = inject(ModalService);
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly imageStorage = inject(ImageStorage);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly t = inject(TRANSLATE_FN);

  private readonly option = (this.modalService.option ?? {}) as Partial<CutInPortraitFitDialogOption>;
  private readonly characterIdentifier = this.option.characterIdentifier ?? '';

  protected readonly margin = PORTRAIT_FIT_MARGIN;
  protected readonly frameWidth = signal(portraitFitFrameWidth(window.innerWidth));
  protected readonly frameHeight = computed(() =>
    Math.round((this.frameWidth() * PORTRAIT_FIT_FRAME.height) / PORTRAIT_FIT_FRAME.width)
  );

  /** The portrait being fitted. */
  readonly picture = signal(this.option.pictureIdentifier ?? '');

  /** The fits changed here and not yet written, by portrait; null for one put back. */
  readonly drafts = signal<ReadonlyMap<string, CutInPortraitFit | null>>(new Map());

  private readonly character = computed(
    () => {
      this.objectChange.versionOf(this.characterIdentifier)();
      const character = this.objectStore.get(this.characterIdentifier);
      return character instanceof GameCharacter ? character : null;
    },
    { equal: () => false }
  );

  /** The character's portraits, each with its picture. */
  readonly portraits = computed(() => {
    this.objectChange.fileVersion();
    const character = this.character();
    if (!character) return [];
    return portraitPicturesOf(character).map((identifier) => ({
      identifier,
      url: this.imageStorage.get(identifier)?.url ?? '',
    }));
  });

  /** The picture of the portrait being fitted, empty where it has none. */
  readonly pictureUrl = computed(() => this.portraits().find((p) => p.identifier === this.picture())?.url ?? '');

  /** How the portrait being fitted sits, or null where it is left to each cut-in. */
  readonly setFit = computed<CutInPortraitFit | null>(() => {
    const drafts = this.drafts();
    const picture = this.picture();
    if (drafts.has(picture)) return drafts.get(picture) ?? null;
    return portraitFitFor(this.character()?.cutInPortraitFits, picture);
  });

  /** How the portrait being fitted is shown here: as set, or whole where it is not. */
  readonly fit = computed(() => this.setFit() ?? WHOLE_PORTRAIT_FIT);
  readonly transform = computed(() => portraitFitTransform(this.fit()));

  private readonly pointers = new Map<number, { x: number; y: number }>();

  constructor() {
    queueMicrotask(() => {
      this.modalService.title = this.t('feature.inventory.sheet.cutInFitTitle');
    });
    const onResize = () => this.frameWidth.set(portraitFitFrameWidth(window.innerWidth));
    window.addEventListener('resize', onResize);
    inject(DestroyRef).onDestroy(() => window.removeEventListener('resize', onResize));
  }

  /** Turns to fitting another of the character's portraits, keeping what was changed on this one. */
  choose(picture: string): void {
    this.picture.set(picture);
    this.pointers.clear();
  }

  private change(fit: CutInPortraitFit | null): void {
    const picture = this.picture();
    if (!picture) return;
    this.drafts.update((drafts) => new Map(drafts).set(picture, fit));
  }

  /** Leaves the portrait being fitted to each cut-in's own framing again. */
  putBack(): void {
    this.change(null);
  }

  /**
   * Where a point on the screen stands on the slot, from its middle, in shares of its size; the
   * middle itself for an event that carries no point.
   */
  private pointOnFrame(frame: HTMLElement, clientX: number, clientY: number): { x: number; y: number } {
    const rect = frame.getBoundingClientRect();
    const width = rect.width || this.frameWidth();
    const height = rect.height || this.frameHeight();
    const x = (clientX - rect.left - width / 2) / width;
    const y = (clientY - rect.top - height / 2) / height;
    return { x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0 };
  }

  protected onPointerDown(event: PointerEvent): void {
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  }

  protected onPointerMove(event: PointerEvent, frame: HTMLElement): void {
    const last = this.pointers.get(event.pointerId);
    if (!last) return;
    const others = [...this.pointers].filter(([id]) => id !== event.pointerId).map(([, point]) => point);
    const now = { x: event.clientX, y: event.clientY };
    this.pointers.set(event.pointerId, now);
    if (others.length === 0) {
      const rect = frame.getBoundingClientRect();
      const dx = (now.x - last.x) / (rect.width || this.frameWidth());
      const dy = (now.y - last.y) / (rect.height || this.frameHeight());
      this.change(movePortraitFit(this.fit(), dx, dy));
      return;
    }
    const other = others[0];
    const before = Math.hypot(last.x - other.x, last.y - other.y);
    const after = Math.hypot(now.x - other.x, now.y - other.y);
    if (before < 1) return;
    const middle = this.pointOnFrame(frame, (now.x + other.x) / 2, (now.y + other.y) / 2);
    this.change(zoomPortraitFit(this.fit(), after / before, middle));
  }

  protected onPointerUp(event: PointerEvent): void {
    (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
    this.pointers.delete(event.pointerId);
  }

  protected onWheel(event: WheelEvent, frame: HTMLElement): void {
    event.preventDefault();
    const factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    this.change(zoomPortraitFit(this.fit(), factor, this.pointOnFrame(frame, event.clientX, event.clientY)));
  }

  protected onKeyDown(event: KeyboardEvent): void {
    const step = event.shiftKey ? KEY_STEP_LARGE : KEY_STEP;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[event.key];
    if (move) {
      this.change(movePortraitFit(this.fit(), move[0], move[1]));
    } else if (event.key === '+' || event.key === '=') {
      this.change(zoomPortraitFit(this.fit(), ZOOM_STEP));
    } else if (event.key === '-') {
      this.change(zoomPortraitFit(this.fit(), 1 / ZOOM_STEP));
    } else {
      return;
    }
    event.preventDefault();
  }

  protected cancel(): void {
    this.modalService.resolve(null);
  }

  /**
   * Writes every fit changed here onto the character at once, dropping those of portraits it no
   * longer has, and closes. Nothing is written for a reader who may not change the table.
   */
  apply(): void {
    const character = this.character();
    const drafts = this.drafts();
    if (character && drafts.size > 0 && this.rolePermission.canEditTabletop) {
      const next = withPortraitFits(character.cutInPortraitFits, drafts, portraitPicturesOf(character));
      if (next !== character.cutInPortraitFits) character.cutInPortraitFits = next;
    }
    this.modalService.resolve(true);
  }
}
