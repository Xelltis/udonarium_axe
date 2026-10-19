import { DestroyRef, inject, Injectable } from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { DisclosureService } from '@axe/application/permission/disclosure.service';
import { ReplayPlaybackService } from '@axe/application/replay/replay-playback.service';
import { FirstPersonService } from '@axe/application/tabletop/first-person.service';
import { PieceTargetService } from '@axe/application/tabletop/piece-target.service';
import { MobileLayoutService } from '@axe/application/ui/mobile-layout.service';
import { OverlayModeService } from '@axe/application/ui/overlay-mode.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { SnackbarService } from '@axe/application/ui/snackbar.service';
import { isTypingTarget } from '@axe/core/input/typing-target';
import { GameObject } from '@axe/core/sync/game-object';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Card } from '@axe/domain/card/card';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DiceSymbol } from '@axe/domain/dice/dice-symbol';
import { DisclosureMode, switchedDisclosureMode } from '@axe/domain/disclosure/disclosure';
import { TextNote } from '@axe/domain/tabletop/text-note';
import { tabletopKeyDown, TabletopShortcutCommand } from '@axe/features/keyboard/tabletop-shortcut';
import { VisualNovelModeService } from '@axe/features/visual-novel/visual-novel-mode.service';

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
 * aim away, and G to switch who they are disclosed to.
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
  private readonly disclosure = inject(DisclosureService);
  private readonly snackbar = inject(SnackbarService);
  private readonly firstPerson = inject(FirstPersonService);
  private readonly visualNovel = inject(VisualNovelModeService);
  private readonly mobile = inject(MobileLayoutService);
  private readonly overlayMode = inject(OverlayModeService);
  private readonly replay = inject(ReplayPlaybackService);
  private readonly t = inject(TRANSLATE_FN);

  constructor() {
    document.addEventListener('keydown', this.onKeyDown);
    inject(DestroyRef).onDestroy(() => document.removeEventListener('keydown', this.onKeyDown));
  }

  /** Does what a command asks of the picked pieces, telling the user how many it touched. */
  run(command: TabletopShortcutCommand): void {
    if (command === 'target') this.aimAtPicked();
    else if (command === 'clearTargets') this.takeAimsAway();
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
    const focused = document.activeElement;
    if (focused && focused !== document.body) return;
    const command = tabletopKeyDown(event.key, {
      typing: isTypingTarget(event.target),
      composing: event.isComposing,
      chord: event.ctrlKey || event.metaKey || event.altKey,
      shift: event.shiftKey,
    });
    if (!command) return;
    event.preventDefault();
    this.run(command);
  };

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

  private takeAimsAway(): void {
    if (!this.targets.anything()) return;
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
