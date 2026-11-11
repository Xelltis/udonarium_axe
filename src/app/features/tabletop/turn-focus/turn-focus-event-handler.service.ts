import { DestroyRef, inject, Injectable } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { FirstPersonService } from '@axe/application/tabletop/first-person.service';
import { GroundBrushService } from '@axe/application/tabletop/ground-brush.service';
import { HeldPieceService } from '@axe/application/tabletop/held-piece.service';
import { MovePlannerService } from '@axe/application/tabletop/move-planner.service';
import { TableFocusService } from '@axe/application/tabletop/table-focus.service';
import { ThirdPersonService } from '@axe/application/tabletop/third-person.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { OverlayModeService } from '@axe/application/ui/overlay-mode.service';
import { TurnFocusPreferenceService } from '@axe/application/ui/turn-focus-preference.service';
import { isNetworkIsolated } from '@axe/core/network/network-isolation';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { isOwnedByUser } from '@axe/domain/character/owned-characters';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { readTurnStart, TurnState } from '@axe/domain/tabletop/turn-state';

/**
 * How lately a turn has to have begun for the view to go to it.
 *
 * A screen joining the room, or coming back after the connection dropped, is told the turn as it
 * stands on the same event a turn being handed over arrives on, and would be carried off to a turn
 * that began before it was there. The same span the turn's sound allows.
 */
const JUST_BEGUN_MS = 30_000;

/**
 * Glides the view to the piece whose turn begins, as this reader has it: for every turn, for their
 * own characters' alone, or not at all.
 *
 * Only to a piece this reader can see on the table: a view carried off to a piece in the dark would
 * tell where it stands. Not while the reader is in the middle of something on the table, holding a
 * piece, planning a move, shaping the ground, or looking out of or after a piece; nor while a
 * recording is played back here or the screen is an overlay for streaming. A turn is gone to once,
 * however often it is told.
 */
@Injectable({ providedIn: 'root' })
export class TurnFocusEventHandlerService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly objectStore = inject(ObjectStore);
  private readonly overlay = inject(OverlayModeService);
  private readonly preference = inject(TurnFocusPreferenceService);
  private readonly vision = inject(VisionService);
  private readonly tableFocus = inject(TableFocusService);
  private readonly held = inject(HeldPieceService);
  private readonly movePlanner = inject(MovePlannerService);
  private readonly groundBrush = inject(GroundBrushService);
  private readonly firstPerson = inject(FirstPersonService);
  private readonly thirdPerson = inject(ThirdPersonService);
  private lastFocused = '';

  constructor() {
    this.objectChange.onObjectChangedForIdentifier('TurnState', () => this.turnChanged(), this.destroyRef);
  }

  private turnChanged(): void {
    const mark = this.objectStore.get<TurnState>('TurnState')?.turnStart ?? '';
    if (mark === this.lastFocused) return;
    const started = readTurnStart(mark);
    if (!started || Date.now() - started.at > JUST_BEGUN_MS) return;
    this.lastFocused = mark;
    if (isNetworkIsolated() || this.overlay.active()) return;

    const setting = this.preference.setting();
    if (setting === 'none') return;
    const piece = this.objectStore.get<GameCharacter>(started.identifier);
    if (!(piece instanceof GameCharacter) || piece.location.name !== 'table') return;
    if (!this.vision.mayBeListed(piece)) return;
    if (setting === 'own' && !isOwnedByUser(piece, PeerCursor.myUserId)) return;
    if (this.busy()) return;
    this.tableFocus.focusOn(piece);
  }

  /** Whether the reader is in the middle of something on the table a gliding view would spoil. */
  private busy(): boolean {
    return (
      this.held.held() !== null ||
      this.movePlanner.isPlanning() ||
      this.groundBrush.active() ||
      this.firstPerson.showing() ||
      this.thirdPerson.following()
    );
  }
}
