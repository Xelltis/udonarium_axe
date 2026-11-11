import { TestBed } from '@angular/core/testing';
import { FirstPersonService } from '@axe/application/tabletop/first-person.service';
import { GroundBrushService } from '@axe/application/tabletop/ground-brush.service';
import { HeldPieceService } from '@axe/application/tabletop/held-piece.service';
import { TableFocusService } from '@axe/application/tabletop/table-focus.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { OverlayModeService } from '@axe/application/ui/overlay-mode.service';
import { SnackbarService } from '@axe/application/ui/snackbar.service';
import { TurnFocusPreferenceService } from '@axe/application/ui/turn-focus-preference.service';
import { setNetworkIsolated } from '@axe/core/network/network-isolation';
import { GameCharacter } from '@axe/domain/character/game-character';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { turnStartMark, TurnState } from '@axe/domain/tabletop/turn-state';
import { TurnFocusEventHandlerService } from '@axe/features/tabletop/turn-focus/turn-focus-event-handler.service';
import { beMyself } from '@axe/testing/peer-context-stub';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import type { MockInstance } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('TurnFocusEventHandlerService', () => {
  let focused: MockInstance<TableFocusService['focusOn']>;
  let pieces: GameCharacter[];

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    beMyself('me');
    PeerCursor.myCursor = null!;
    localStorage.removeItem('ui-turn-focus');
    localStorage.setItem('ui-turn-focus-told', '1');
    focused = vi.spyOn(TestBed.inject(TableFocusService), 'focusOn').mockImplementation(() => undefined);
    vi.spyOn(TestBed.inject(VisionService), 'mayBeListed').mockReturnValue(true);
    TestBed.inject(TurnFocusEventHandlerService);
    pieces = [];
  });

  afterEach(() => {
    setNetworkIsolated(false);
    for (const piece of pieces) piece.destroy();
    TurnState.instance.turnStart = '';
    localStorage.removeItem('ui-turn-focus');
    localStorage.removeItem('ui-turn-focus-told');
    vi.restoreAllMocks();
  });

  function pieceOf(owner = ''): GameCharacter {
    const piece = GameCharacter.create('コマ', 1, '');
    piece.setLocation('table');
    piece.owner = owner;
    pieces.push(piece);
    return piece;
  }

  /** Begins a piece's turn as it reaches this screen, `ago` ms after it began. */
  async function turnOf(piece: GameCharacter, ago = 0): Promise<void> {
    const turns = TurnState.instance;
    turns.currentIdentifier = piece.identifier;
    turns.turnStart = turnStartMark(piece.identifier, Date.now() - ago);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  it('glides the view to the piece whose turn begins, once however often it is told', async () => {
    const piece = pieceOf();

    await turnOf(piece);
    TurnState.instance.currentIdentifier = piece.identifier;
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(focused).toHaveBeenCalledExactlyOnceWith(piece);
  });

  it('tells the reader the first time the view goes to a turn, with a press that keeps it still, and not after', async () => {
    localStorage.removeItem('ui-turn-focus-told');
    const snackbar = TestBed.inject(SnackbarService);
    const shown = vi.spyOn(snackbar, 'show');

    await turnOf(pieceOf());
    expect(shown).toHaveBeenCalledTimes(1);
    snackbar.runAction();
    expect(TestBed.inject(TurnFocusPreferenceService).setting()).toBe('none');

    TestBed.inject(TurnFocusPreferenceService).set('all');
    await turnOf(pieceOf());
    expect(focused).toHaveBeenCalledTimes(2);
    expect(shown).toHaveBeenCalledTimes(1);
  });

  it('goes to none the reader cannot see, nor off the table', async () => {
    vi.spyOn(TestBed.inject(VisionService), 'mayBeListed').mockReturnValue(false);
    await turnOf(pieceOf());
    const away = pieceOf();
    away.setLocation('common');
    vi.spyOn(TestBed.inject(VisionService), 'mayBeListed').mockReturnValue(true);
    await turnOf(away);

    expect(focused).not.toHaveBeenCalled();
  });

  it('goes only to the reader’s own characters where they say so, and to none where they turn it off', async () => {
    const preference = TestBed.inject(TurnFocusPreferenceService);
    preference.set('own');
    const theirs = pieceOf('someone-else');
    const mine = pieceOf('me');
    await turnOf(theirs);
    await turnOf(mine);
    expect(focused.mock.calls.map(([piece]) => piece)).toEqual([mine]);

    preference.set('none');
    await turnOf(theirs);
    expect(focused).toHaveBeenCalledTimes(1);
  });

  it('leaves the view alone for a turn begun before this screen heard of it, in a recording or an overlay', async () => {
    await turnOf(pieceOf(), 60_000);
    setNetworkIsolated(true);
    await turnOf(pieceOf());
    setNetworkIsolated(false);
    vi.spyOn(TestBed.inject(OverlayModeService), 'active').mockReturnValue(true);
    await turnOf(pieceOf());

    expect(focused).not.toHaveBeenCalled();
  });

  it('leaves the view alone while the reader holds a piece, shapes the ground or looks out of a piece', async () => {
    const held = TestBed.inject(HeldPieceService);
    const brush = TestBed.inject(GroundBrushService);
    vi.spyOn(held, 'held').mockReturnValue({} as never);
    await turnOf(pieceOf());
    vi.spyOn(held, 'held').mockReturnValue(null);
    brush.active.set(true);
    await turnOf(pieceOf());
    brush.active.set(false);
    vi.spyOn(TestBed.inject(FirstPersonService), 'showing').mockReturnValue(true);
    await turnOf(pieceOf());

    expect(focused).not.toHaveBeenCalled();
  });
});
