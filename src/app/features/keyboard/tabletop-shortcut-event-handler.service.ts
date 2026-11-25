import { DestroyRef, inject, Injectable } from '@angular/core';
import { ActiveCharacterService } from '@axe/application/character/active-character.service';
import { PieceNameService } from '@axe/application/character/piece-name.service';
import { EffectTargetingService } from '@axe/application/effect/effect-targeting.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { DisclosureService } from '@axe/application/permission/disclosure.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ReplayPlaybackService } from '@axe/application/replay/replay-playback.service';
import { FirstPersonService } from '@axe/application/tabletop/first-person.service';
import { PieceTargetService } from '@axe/application/tabletop/piece-target.service';
import { RulerService } from '@axe/application/tabletop/ruler.service';
import { TurnOrderService } from '@axe/application/turn/turn-order.service';
import { MobileLayoutService } from '@axe/application/ui/mobile-layout.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { OverlayModeService } from '@axe/application/ui/overlay-mode.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { SnackbarService } from '@axe/application/ui/snackbar.service';
import { VisualNovelModeService } from '@axe/application/ui/visual-novel-mode.service';
import { isTypingTarget } from '@axe/core/input/typing-target';
import { GameObject } from '@axe/core/sync/game-object';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Card } from '@axe/domain/card/card';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DiceSymbol } from '@axe/domain/dice/dice-symbol';
import { DisclosureMode, switchedDisclosureMode } from '@axe/domain/disclosure/disclosure';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { TextNote } from '@axe/domain/tabletop/text-note';
import { tabletopKeyDown, TabletopKeyFocus, TabletopShortcutCommand } from '@axe/features/keyboard/tabletop-shortcut';

type DisclosablePiece = GameCharacter | Card | DiceSymbol | TextNote;

function isDisclosablePiece(object: GameObject): object is DisclosablePiece {
  return (
    object instanceof GameCharacter ||
    object instanceof Card ||
    object instanceof DiceSymbol ||
    object instanceof TextNote
  );
}

/**
 * The keys that act on the pieces picked out on the table: T to aim at them, Shift+T to take every
 * aim away, and G to switch who they are disclosed to; M, which takes the ruler up or puts it away;
 * and Tab and Shift+Tab, which aim at the pieces of the other side one at a time, nearest first.
 *
 * The picked pieces are the ones gathered with Ctrl+click or a dragged box, or else the one piece
 * clicked last. Keys are only taken while nothing else holds the keyboard: not while typing, not
 * while a panel has the focus (the white board and the map editor use letters of their own), and
 * not in the first-person view, which answers T itself. Novel mode, the small-screen layout, the
 * streaming overlay and a replay on the board leave the table alone as well.
 */
@Injectable({ providedIn: 'root' })
export class TabletopShortcutEventHandlerService {
  private readonly selection = inject(SelectionSignalService);
  private readonly objectStore = inject(ObjectStore);
  private readonly targets = inject(PieceTargetService);
  private readonly effectTargeting = inject(EffectTargetingService);
  private readonly disclosure = inject(DisclosureService);
  private readonly snackbar = inject(SnackbarService);
  private readonly firstPerson = inject(FirstPersonService);
  private readonly visualNovel = inject(VisualNovelModeService);
  private readonly mobile = inject(MobileLayoutService);
  private readonly overlayMode = inject(OverlayModeService);
  private readonly replay = inject(ReplayPlaybackService);
  private readonly t = inject(TRANSLATE_FN);
  private readonly ruler = inject(RulerService);
  private readonly permission = inject(RolePermissionService);
  private readonly turnOrder = inject(TurnOrderService);
  private readonly activeCharacter = inject(ActiveCharacterService);
  private readonly names = inject(PieceNameService);
  private readonly modal = inject(ModalService);

  /** What the pointer last pressed, while the focus stays with it; null once the keyboard moved the focus away. */
  private pressed: Element | null = null;

  constructor() {
    document.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('pointerdown', this.onPointerDown, true);
    document.addEventListener('focusin', this.onFocusIn, true);
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('keydown', this.onKeyDown);
      document.removeEventListener('pointerdown', this.onPointerDown, true);
      document.removeEventListener('focusin', this.onFocusIn, true);
    });
  }

  private readonly onPointerDown = (event: Event): void => {
    this.pressed = event.target instanceof Element ? event.target : null;
  };

  private readonly onFocusIn = (event: Event): void => {
    if (this.pressed && !(event.target instanceof Element && isAlong(event.target, this.pressed))) this.pressed = null;
  };

  /**
   * Where the focus is, as the keys on the table read it: on nothing where it is on the page itself;
   * on what the pointer last pressed, or around it, where it has stayed there since; else on what the
   * keyboard moved it to.
   */
  private focusOf(focused: Element | null): TabletopKeyFocus {
    if (!focused || focused === document.body || focused === document.documentElement) return 'none';
    return this.pressed && isAlong(focused, this.pressed) ? 'pressed' : 'keyboard';
  }

  /** Does what a command asks of the picked pieces, telling the user how many it touched. */
  run(command: TabletopShortcutCommand): void {
    if (command === 'target') this.aimAtPicked();
    else if (command === 'clearTargets') this.takeAimsAway();
    else if (command === 'nextTarget') this.aimOnward(1);
    else if (command === 'previousTarget') this.aimOnward(-1);
    else if (command === 'toggleRuler') this.takeRuler();
    else this.switchDisclosure();
  }

  private blocked(): boolean {
    return (
      this.visualNovel.active() ||
      this.mobile.isActive() ||
      this.overlayMode.active() ||
      this.firstPerson.showing() ||
      this.replay.isBoardMode()
    );
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || this.blocked()) return;
    const command = tabletopKeyDown(event.key, {
      focus: this.focusOf(document.activeElement),
      modal: this.modal.isShow || document.querySelector('[aria-modal="true"]') !== null,
      typing: isTypingTarget(event.target),
      composing: event.isComposing,
      chord: event.ctrlKey || event.metaKey || event.altKey,
      shift: event.shiftKey,
    });
    if (!command) return;
    if (
      (command === 'nextTarget' || command === 'previousTarget') &&
      this.targets.aimOrderFrom(this.aimedFrom()).length < 1
    ) {
      return;
    }
    event.preventDefault();
    this.run(command);
  };

  /** Takes the ruler up or puts it away, for a seat playing at the table; one watching has none. */
  private takeRuler(): void {
    if (!this.permission.canEditTabletop()) return;
    this.ruler.toggle();
  }

  private pickedPieces(): GameObject[] {
    const identifiers = [...this.selection.selectedObjects()];
    const last = this.selection.selectedObject();
    if (identifiers.length < 1 && last) identifiers.push(last.identifier);
    return identifiers
      .map((identifier) => this.objectStore.get(identifier))
      .filter((object): object is GameObject => object != null);
  }

  private aimAtPicked(): void {
    const characters = this.pickedPieces().filter((piece) => piece instanceof GameCharacter);
    if (characters.length < 1) {
      this.snackbar.show(this.t('feature.keyboard.tabletop.nothingToTarget'));
      return;
    }
    this.targets.setOnly(characters);
    this.snackbar.show(this.t('feature.keyboard.tabletop.targeted', { count: characters.length }));
  }

  /**
   * Aims at the next piece of the other side, or the one before, from the piece the aim is taken from:
   * the first this seat sees of the piece whose turn it is, the piece picked last, the piece this seat
   * plays and the first piece of its own it may aim at (see `PieceTargetService.aimNext`). The key is
   * read only where there is a piece to aim at, and moves the focus on as anywhere else where there is
   * none.
   */
  private aimOnward(step: 1 | -1): void {
    const next = this.targets.aimNext(this.aimedFrom(), step);
    if (next) this.snackbar.show(this.t('feature.keyboard.tabletop.targetedOne', { name: this.names.shown(next) }));
  }

  private aimedFrom(): GameCharacter | null {
    const piece = (identifier: string | null | undefined) => {
      const found = identifier ? this.objectStore.get(identifier) : null;
      return found instanceof GameCharacter ? found : null;
    };
    const me = PeerCursor.myCursor?.userId ?? '';
    return this.targets.aimedFromOf([
      piece(this.turnOrder.currentIdentifier),
      piece(this.selection.selectedObject()?.identifier),
      piece(this.activeCharacter.identifier()),
      this.targets.aimable().find((one) => me.length > 0 && one.owner === me),
    ]);
  }

  private takeAimsAway(): void {
    if (!this.targets.anything() && !this.effectTargeting.isPicking()) return;
    this.targets.clear();
    this.snackbar.show(this.t('feature.keyboard.tabletop.targetsCleared'));
  }

  private switchDisclosure(): void {
    const pieces = this.pickedPieces()
      .filter(isDisclosablePiece)
      .filter((piece) => this.disclosure.canEdit(piece));
    if (pieces.length < 1) {
      this.snackbar.show(this.t('feature.keyboard.tabletop.nothingToDisclose'));
      return;
    }
    const next = switchedDisclosureMode(pieces.map((piece) => piece.disclosureMode));
    for (const piece of pieces) {
      if (piece.disclosureMode === next) continue;
      piece.disclosureMode = next;
      piece.update();
    }
    const key = next === DisclosureMode.All ? 'disclosedToAll' : 'disclosedToGm';
    this.snackbar.show(this.t(`feature.keyboard.tabletop.${key}`, { count: pieces.length }));
  }
}

/** Whether one element holds the other, either way round, as a button holds the icon pressed on it. */
function isAlong(one: Element, other: Element): boolean {
  return one.contains(other) || other.contains(one);
}
