import {
  afterNextRender,
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  DOCUMENT,
  effect,
  type ElementRef,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { observeSize } from '@axe/core/util/observe-size';
import type { GameCharacter } from '@axe/domain/character/game-character';
import { InventoryRoundService } from '@axe/features/inventory/inventory-round.service';
import {
  DOCK_FACE,
  type DockEntry,
  type DockSlot,
  layDock,
  pieceAt,
} from '@axe/features/inventory/inventory-round-view/round-dock';
import { InventoryViewPreferenceService } from '@axe/features/inventory/inventory-view-preference.service';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { Z_POINTER_PEEK } from '@axe/ui/z-layers';
import { TranslocoModule } from '@jsverse/transloco';

/** How long a side's heading stands along the turn order, laid down and laid across. */
const HEADING_DOWN = 22;
const HEADING_ACROSS = 20;
/** How wide the turn order stands laid down, room enough for a side's name over the faces. */
const STRIP_WIDTH_DOWN = 104;
/** How tall the turn order stands laid across. */
const STRIP_HEIGHT_ACROSS = DOCK_FACE + 8;
/** The shortest the turn order is made, however little room the screen leaves. */
const LEAST_LENGTH = 160;
/**
 * How far the turn order keeps from the edge of the screen it runs towards: room for the end that
 * is dragged to make it shorter, and the panel's own edge after it.
 */
const SCREEN_MARGIN = 32;
/** How far beside the turn order a press may be drawn off and still point along it. */
const CROSS_SLACK = 72;
/** How far a press of a key moves the end of the turn order. */
const LENGTH_KEY_STEP = 16;

/** A piece laid along the turn order, with where it stands and what is told of it. */
interface DockPiece {
  readonly kind: 'piece';
  readonly slot: DockSlot;
  readonly order: number;
  readonly piece: GameCharacter;
  readonly current: boolean;
  readonly next: boolean;
  readonly acted: boolean;
  readonly held: boolean;
  readonly side: string;
  readonly companions: readonly GameCharacter[];
}

/** A side's heading laid along the turn order. */
interface DockHeading {
  readonly kind: 'heading';
  readonly slot: DockSlot;
  readonly name: string;
  readonly color: string;
  readonly current: boolean;
}

/** Where the face pointed at is drawn out beside the turn order, on the screen. */
interface PeekPlace {
  readonly x: number;
  readonly y: number;
  readonly transform: string;
}

/**
 * The inventory shrunk to the turn order: the round's pieces, under their sides when the round is
 * taken side by side, with the presses that move it on above them, laid down or across.
 *
 * Every piece of the round is on it at all times, and is handed the turn with a single press. It
 * stands no longer than the screen leaves room for, or the length the reader has dragged its end
 * to: where every face does not fit at its full size, the one whose turn it is keeps it, and the rest
 * are drawn smaller and then laid each a little over the one before. The face a pointer or finger
 * is over, or the keys have come to, is drawn out beside it with its name and how it stands, so a
 * face laid under others is known before it is pressed, and a press slid along the turn order hands
 * the turn to the face it is let go on.
 */
@Component({
  selector: 'inventory-round-view',
  templateUrl: './inventory-round-view.component.html',
  host: { class: 'contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SafePipe, TranslocoModule],
})
export class InventoryRoundViewComponent {
  protected readonly turns = inject(InventoryRoundService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly preference = inject(InventoryViewPreferenceService);
  private readonly t = inject(TRANSLATE_FN);

  /** Whether this reader may press the round on, which a seat that is only watching may not. */
  protected readonly canEdit = computed<boolean>(() => this.rolePermission.canEditTabletop());
  /** Whether the turn order is laid across rather than down. */
  protected readonly across = this.preference.roundAcross;
  protected readonly peekLayer = Z_POINTER_PEEK;
  protected readonly leastLength = LEAST_LENGTH;
  /** How long the turn order runs now, rounded for a screen reader to say. */
  protected readonly lengthNow = computed(() => Math.round(this.laidLength()));
  /** The most the turn order may run, as the screen leaves it room, rounded for a screen reader to say. */
  protected readonly mostLength = computed(() => {
    const room = this.room();
    return Number.isFinite(room) ? Math.round(room) : null;
  });
  protected readonly stripWidthDown = STRIP_WIDTH_DOWN;
  protected readonly stripHeightAcross = STRIP_HEIGHT_ACROSS;

  /**
   * Whether the faces move to where they come to stand, as the turn passes on. Not until the room
   * has been read the first time, so the turn order does not open by sliding into its room.
   */
  protected readonly moving = signal(false);

  /** How much room the screen leaves the turn order, from where it begins to the edge it runs towards. */
  private readonly room = signal(Number.POSITIVE_INFINITY);
  /** The length the end is being dragged to, until it is let go. */
  private readonly draggedLength = signal<number | null>(null);
  /** How long the turn order stands. */
  protected readonly length = computed(() => {
    const across = this.across();
    const chosen = this.draggedLength() ?? this.preference.roundLength()[across ? 'across' : 'down'];
    return Math.max(LEAST_LENGTH, Math.min(this.room(), chosen ?? Number.POSITIVE_INFINITY));
  });

  private readonly entries = computed(() => {
    const progress = this.turns.progress();
    const next = this.turns.nextIdentifier();
    const companions = this.turns.companions();
    const sides = this.turns.sides();
    const currentSide = this.turns.currentSide();
    const piece = (character: GameCharacter, side: string) => ({
      character,
      side,
      current: character.identifier === progress.currentIdentifier,
      next: character.identifier === next,
      acted: progress.acted.has(character.identifier),
      held: progress.held.has(character.identifier),
      companions: companions.get(character.identifier) ?? [],
    });
    if (sides.length < 1) return this.turns.order().map((character) => piece(character, ''));
    return sides.flatMap((group) => [
      { heading: group, current: group.side === currentSide },
      ...group.members.map((member) => piece(member, group.name)),
    ]);
  });

  /** Everything laid along the turn order, where it stands and what is told of it. */
  protected readonly laid = computed<(DockPiece | DockHeading)[]>(() => {
    const entries = this.entries();
    const dock: DockEntry[] = entries.map((entry) =>
      'heading' in entry
        ? { kind: 'heading', key: `side:${entry.heading.side}` }
        : { kind: 'piece', key: entry.character.identifier, current: entry.current, next: entry.next }
    );
    const layout = layDock(dock, this.length(), this.across() ? HEADING_ACROSS : HEADING_DOWN);
    let order = 0;
    return entries.map((entry, index) => {
      const slot = layout.slots[index];
      if ('heading' in entry) {
        return {
          kind: 'heading',
          slot,
          name: entry.heading.name,
          color: entry.heading.color,
          current: entry.current,
        };
      }
      return {
        kind: 'piece',
        slot,
        order: order++,
        piece: entry.character,
        current: entry.current,
        next: entry.next,
        acted: entry.acted,
        held: entry.held,
        side: entry.side,
        companions: entry.companions,
      };
    });
  });

  private readonly layout = computed(() => ({
    slots: this.laid().map((one) => one.slot),
    length: this.laidLength(),
  }));
  protected readonly laidLength = computed(() => {
    const last = this.laid().at(-1)?.slot;
    return last ? last.at + last.size : 0;
  });

  /**
   * The piece drawn out beside the turn order, and whether a pointer or the keys brought it there, or
   * a touch left it there to be looked at before the turn is handed over.
   */
  protected readonly peekKey = signal<string | null>(null);
  private peekBy: 'pointer' | 'keys' | 'pinned' | null = null;
  /** Whether a touch has left a face drawn out, with a press to hand it the turn. */
  protected readonly pinned = signal(false);
  /** Whether a touch, rather than a mouse or the keys, drew the face out, which a lift does not hand the turn. */
  protected readonly peekByTouch = signal(false);
  /** The face a touch had left drawn out when the press now on the turn order came down, if any. */
  private pinnedAtPress: string | null = null;
  protected readonly peekPlace = signal<PeekPlace | null>(null);
  protected readonly peek = computed(() => {
    const key = this.peekKey();
    return this.laid().find((one): one is DockPiece => one.kind === 'piece' && one.piece.identifier === key) ?? null;
  });

  /** The piece the Tab key stops at in the turn order: the last the keys came to, or the one up. */
  private readonly keyed = signal<string | null>(null);
  protected readonly tabStop = computed(() => {
    const pieces = this.laid().filter((one): one is DockPiece => one.kind === 'piece');
    const keyed = this.keyed();
    if (keyed && pieces.some((one) => one.piece.identifier === keyed)) return keyed;
    return (pieces.find((one) => one.current) ?? pieces[0])?.piece.identifier ?? null;
  });

  private readonly head = viewChild<ElementRef<HTMLElement>>('head');
  private readonly strip = viewChild<ElementRef<HTMLElement>>('strip');
  private readonly peekBox = viewChild<ElementRef<HTMLElement>>('peekBox');
  private pressing: number | null = null;
  private dragging: { pointerId: number; start: number } | null = null;

  constructor() {
    const destroyRef = inject(DestroyRef);
    const page = inject(DOCUMENT);
    afterNextRender(() => {
      const box = this.peekBox()?.nativeElement;
      // Drawn on the page itself, so the panel the turn order stands in neither clips it nor places it.
      if (box) box.ownerDocument.body.appendChild(box);
      // Listened for from the first, as the turn order may come only once the first piece joins the round.
      const view = page.defaultView;
      if (!view) return;
      const measure = () => this.measure();
      view.addEventListener('resize', measure);
      // The panel is moved by dragging its bar, and the room it leaves is read again once it is let go.
      view.addEventListener('pointerup', measure, true);
      // The presses above it come and go, and the round's number with them, moving where it begins.
      const head = this.head()?.nativeElement;
      const stopWatchingHead = head ? observeSize(head, measure) : () => undefined;
      destroyRef.onDestroy(() => {
        stopWatchingHead();
        view.removeEventListener('resize', measure);
        view.removeEventListener('pointerup', measure, true);
      });
    });
    destroyRef.onDestroy(() => this.peekBox()?.nativeElement.remove());
    // A face a touch left drawn out is put away by a press anywhere but on it or on the turn order.
    const letGoOfPinned = (event: Event) => {
      if (!this.pinned()) return;
      const target = event.target as Node | null;
      if (target && (this.strip()?.nativeElement.contains(target) || this.peekBox()?.nativeElement.contains(target)))
        return;
      this.hidePeek();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && this.pinned()) this.hidePeek();
    };
    page.addEventListener('pointerdown', letGoOfPinned, true);
    page.addEventListener('keydown', escape);
    destroyRef.onDestroy(() => {
      page.removeEventListener('pointerdown', letGoOfPinned, true);
      page.removeEventListener('keydown', escape);
    });
    // Laid across, the panel stands as wide as the turn order runs, rather than as the narrow bar.
    const panel = inject(PanelService, { optional: true });
    if (panel) {
      effect(() => panel.shrunkToContentWidth.set(this.across()));
      destroyRef.onDestroy(() => panel.shrunkToContentWidth.set(false));
    }
    // Laid the other way, the turn order runs towards another edge of the screen.
    // The room is read as the turn order first comes, which an empty round puts off until a piece
    // joins it, and again as it is laid the other way; the faces move only once it has been read.
    afterRenderEffect(() => {
      this.across();
      if (!this.strip()) return;
      untracked(() => {
        this.measure();
        if (!this.moving()) page.defaultView?.requestAnimationFrame(() => this.moving.set(true));
      });
    });
  }

  /** Reads again how much room the screen leaves the turn order. */
  private measure(): void {
    const strip = this.strip()?.nativeElement;
    const view = strip?.ownerDocument.defaultView;
    if (!strip || !view) return;
    const rect = strip.getBoundingClientRect();
    const room = this.across()
      ? view.innerWidth - rect.left - SCREEN_MARGIN
      : view.innerHeight - rect.top - SCREEN_MARGIN;
    if (Math.abs(room - this.room()) >= 1) this.room.set(room);
  }

  protected onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    event.preventDefault();
    this.pressing = event.pointerId;
    this.pinnedAtPress = this.pinned() ? this.peekKey() : null;
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    this.pointAt(event);
  }

  protected onPointerMove(event: PointerEvent): void {
    if (this.pressing === event.pointerId || (this.pressing === null && event.pointerType === 'mouse')) {
      this.pointAt(event);
    }
  }

  /**
   * Hands the turn to the face a mouse is let go over. A touch first only leaves the face it is lifted
   * from drawn out, as a finger hides what it lands on: the turn goes over from the press drawn out
   * with it, or from the same face pressed again.
   */
  protected onPointerUp(event: PointerEvent): void {
    if (this.pressing !== event.pointerId) return;
    this.pressing = null;
    const key = this.peekBy === 'pointer' ? this.peekKey() : null;
    if (event.pointerType === 'mouse') {
      if (key) this.give(key);
      return;
    }
    if (key && key === this.pinnedAtPress) {
      this.give(key);
      this.hidePeek();
    } else if (key) {
      this.peekBy = 'pinned';
      this.pinned.set(true);
    } else {
      this.hidePeek();
    }
  }

  protected onPointerCancel(): void {
    this.pressing = null;
    if (!this.pinned()) this.hidePeek();
  }

  protected onPointerLeave(event: PointerEvent): void {
    if (this.pressing === null && event.pointerType === 'mouse' && this.peekBy === 'pointer') this.hidePeek();
  }

  /** Draws out the face a pointer is over, or none where it is drawn off the turn order. */
  private pointAt(event: PointerEvent): void {
    const strip = this.strip()?.nativeElement;
    if (!strip) return;
    const rect = strip.getBoundingClientRect();
    const across = this.across();
    const along = across ? event.clientX - rect.left : event.clientY - rect.top;
    const aside = across ? event.clientY - (rect.top + rect.height / 2) : event.clientX - (rect.left + rect.width / 2);
    const key = Math.abs(aside) > CROSS_SLACK ? null : pieceAt(this.layout(), along);
    this.peekByTouch.set(event.pointerType !== 'mouse');
    this.showPeek(key, 'pointer', rect);
  }

  protected onFocus(identifier: string): void {
    this.keyed.set(identifier);
    this.peekByTouch.set(false);
    const strip = this.strip()?.nativeElement;
    if (strip) this.showPeek(identifier, 'keys', strip.getBoundingClientRect());
  }

  protected onBlur(): void {
    if (this.peekBy === 'keys') this.hidePeek();
  }

  /** Moves along the turn order with the arrow keys the way it is laid, and to its ends with Home and End. */
  protected onKeyDown(event: KeyboardEvent): void {
    const pieces = this.laid().filter((one): one is DockPiece => one.kind === 'piece');
    if (pieces.length < 1) return;
    const across = this.across();
    const at = pieces.findIndex((one) => one.piece.identifier === this.keyed());
    const moves: Record<string, () => number> = {
      [across ? 'ArrowRight' : 'ArrowDown']: () => Math.min(pieces.length - 1, at + 1),
      [across ? 'ArrowLeft' : 'ArrowUp']: () => Math.max(0, at - 1),
      Home: () => 0,
      End: () => pieces.length - 1,
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    const target = pieces[move()].piece.identifier;
    this.keyed.set(target);
    this.strip()
      ?.nativeElement.querySelector<HTMLElement>(`[data-turn-piece="${CSS.escape(target)}"]`)
      ?.focus();
  }

  /** What a face says of itself to a screen reader: its name, and how it stands. */
  protected pieceLabel(one: DockPiece): string {
    const told = [one.piece.name];
    if (one.current) told.push(this.t('feature.turnOrder.peekCurrent'));
    else if (one.next) told.push(this.t('feature.turnOrder.peekNext'));
    if (one.acted && !one.current) told.push(this.t('feature.turnOrder.acted'));
    else if (one.held) told.push(this.t('feature.turnOrder.held'));
    if (one.companions.length > 0) told.push(this.t('feature.turnOrder.peekWith', { names: this.companionNames(one) }));
    return told.join(' / ');
  }

  /** The names of the pieces taking their turn in a piece's, as its face drawn out says them. */
  protected companionNames(one: DockPiece): string {
    return one.companions.map((companion) => companion.name).join(', ');
  }

  /** Hands a piece the turn, where this reader may move the round on and it is not its turn already. */
  protected give(identifier: string): void {
    if (!this.canEdit()) return;
    const one = this.laid().find((laid) => laid.kind === 'piece' && laid.piece.identifier === identifier);
    if (one?.kind === 'piece' && one.current) return;
    this.turns.giveTurnTo(identifier);
  }

  /** Hands the turn to the face a touch left drawn out, from the press drawn out with it. */
  protected giveShown(): void {
    const key = this.peekKey();
    if (key) this.give(key);
    this.hidePeek();
  }

  private showPeek(key: string | null, by: 'pointer' | 'keys', rect: DOMRect): void {
    const slot = key ? this.layout().slots.find((one) => one.key === key) : undefined;
    if (!key || !slot) {
      this.hidePeek();
      return;
    }
    this.peekBy = by;
    this.peekKey.set(key);
    const view = this.strip()?.nativeElement.ownerDocument.defaultView;
    const middle = slot.at + slot.size / 2;
    if (this.across()) {
      const below = !view || rect.bottom + 120 < view.innerHeight;
      this.peekPlace.set({
        x: rect.left + middle,
        y: below ? rect.bottom + 8 : rect.top - 8,
        transform: below ? 'translateX(-50%)' : 'translate(-50%, -100%)',
      });
    } else {
      const right = !view || rect.right + 240 < view.innerWidth;
      this.peekPlace.set({
        x: right ? rect.right + 8 : rect.left - 8,
        y: rect.top + middle,
        transform: right ? 'translateY(-50%)' : 'translate(-100%, -50%)',
      });
    }
  }

  private hidePeek(): void {
    this.peekBy = null;
    this.pinned.set(false);
    this.peekKey.set(null);
    this.peekPlace.set(null);
  }

  protected onLengthDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    const strip = this.strip()?.nativeElement;
    if (!strip) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = strip.getBoundingClientRect();
    this.dragging = { pointerId: event.pointerId, start: this.across() ? rect.left : rect.top };
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
  }

  protected onLengthMove(event: PointerEvent): void {
    if (this.dragging?.pointerId !== event.pointerId) return;
    const reached = (this.across() ? event.clientX : event.clientY) - this.dragging.start;
    this.draggedLength.set(Math.max(LEAST_LENGTH, Math.min(this.room(), reached)));
  }

  protected onLengthUp(event: PointerEvent): void {
    if (this.dragging?.pointerId !== event.pointerId) return;
    this.dragging = null;
    const dragged = this.draggedLength();
    this.draggedLength.set(null);
    if (dragged !== null) this.preference.setRoundLength(this.across(), dragged);
  }

  /** Lets the turn order run again as long as the screen leaves room for. */
  protected resetLength(): void {
    this.preference.setRoundLength(this.across(), null);
  }

  protected onLengthKey(event: KeyboardEvent): void {
    const across = this.across();
    const longer = across ? 'ArrowRight' : 'ArrowDown';
    const shorter = across ? 'ArrowLeft' : 'ArrowUp';
    if (event.key === 'Home') {
      event.preventDefault();
      this.resetLength();
      return;
    }
    if (event.key !== longer && event.key !== shorter) return;
    event.preventDefault();
    const length = this.length() + (event.key === longer ? LENGTH_KEY_STEP : -LENGTH_KEY_STEP);
    this.preference.setRoundLength(across, Math.max(LEAST_LENGTH, Math.min(this.room(), length)));
  }
}
