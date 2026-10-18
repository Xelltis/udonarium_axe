import { TestBed } from '@angular/core/testing';
import { OverlayModeService } from '@axe/application/ui/overlay-mode.service';
import { TURN_SE_SIGNAL, TURN_SE_TICK } from '@axe/core/audio/turn-chime';
import { setNetworkIsolated } from '@axe/core/network/network-isolation';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { turnStartMark, TurnState } from '@axe/domain/tabletop/turn-state';
import { TurnChimePlayer } from '@axe/features/media/turn-sound/turn-chime-player';
import { TurnSoundEventHandlerService } from '@axe/features/media/turn-sound/turn-sound-event-handler.service';
import { beMyself } from '@axe/testing/peer-context-stub';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import type { MockInstance } from 'vitest';

describe('TurnSoundEventHandlerService', () => {
  let played: MockInstance<TurnChimePlayer['play']>;
  let config: Config;
  let pieces: GameCharacter[];

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    beMyself('me');
    PeerCursor.myCursor = null!;
    config = ObjectStore.instance.get<Config>('Config') ?? new Config('Config');
    if (!ObjectStore.instance.get('Config')) config.initialize();
    config.turnSignalEnabled = true;
    config.turnTickEnabled = false;
    played = vi.spyOn(TestBed.inject(TurnChimePlayer), 'play').mockImplementation(() => undefined);
    TestBed.inject(TurnSoundEventHandlerService);
    pieces = [];
  });

  afterEach(() => {
    setNetworkIsolated(false);
    for (const piece of pieces) piece.destroy();
    TurnState.instance.turnStart = '';
    vi.restoreAllMocks();
  });

  function pieceOf(owner: string, npc = false): GameCharacter {
    const piece = GameCharacter.create('コマ', 1, '');
    piece.owner = owner;
    piece.isNpc = npc;
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

  it('signals the owner when the turn of their character begins', async () => {
    await turnOf(pieceOf('me'));

    expect(played).toHaveBeenCalledExactlyOnceWith(TURN_SE_SIGNAL);
  });

  it('plays nothing for someone else’s turn while the room leaves ticks off', async () => {
    await turnOf(pieceOf('someone'));

    expect(played).not.toHaveBeenCalled();
  });

  it('ticks for someone else’s turn, one nobody owns, and an NPC, the master’s own included, once ticks are on', async () => {
    config.turnTickEnabled = true;

    await turnOf(pieceOf('someone'));
    await turnOf(pieceOf(''));
    await turnOf(pieceOf('me', true));

    expect(played.mock.calls).toEqual([[TURN_SE_TICK], [TURN_SE_TICK], [TURN_SE_TICK]]);
  });

  it('plays no signal once the room turns it off', async () => {
    config.turnSignalEnabled = false;
    config.turnTickEnabled = true;

    await turnOf(pieceOf('me'));

    expect(played).not.toHaveBeenCalled();
  });

  it('stays quiet for a turn that began before this screen was told of it, as on joining', async () => {
    await turnOf(pieceOf('me'), 60_000);

    expect(played).not.toHaveBeenCalled();
  });

  it('chimes a turn once however often it is told', async () => {
    const mine = pieceOf('me');
    await turnOf(mine);
    TurnState.instance.round = TurnState.instance.round + 1;
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(played).toHaveBeenCalledOnce();
  });

  it('stays quiet while a recording plays back on this screen', async () => {
    setNetworkIsolated(true);

    await turnOf(pieceOf('me'));

    expect(played).not.toHaveBeenCalled();
  });

  it('stays quiet as an overlay for streaming', async () => {
    const bodyClass = document.body.className;
    TestBed.inject(OverlayModeService).activate();

    try {
      await turnOf(pieceOf('me'));

      expect(played).not.toHaveBeenCalled();
    } finally {
      document.body.className = bodyClass;
    }
  });
});
