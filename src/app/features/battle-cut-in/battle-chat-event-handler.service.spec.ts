import { TestBed } from '@angular/core/testing';
import { BattleLaunchLoaderService } from '@axe/application/battle/battle-launch-loader.service';
import { EffectCastService } from '@axe/application/effect/effect-cast.service';
import { emitResourceEditMessage } from '@axe/core/event/domain-events';
import { IPeerContext } from '@axe/core/network/peer-context';
import { resetPeerContextProvider, setPeerContextProvider } from '@axe/core/network/peer-context-source';
import { PeerSessionGrade } from '@axe/core/network/peer-session-state';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { BattleChatEventHandlerService } from '@axe/features/battle-cut-in/battle-chat-event-handler.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('BattleChatEventHandlerService', () => {
  const SELF_USER_ID = 'user-self';
  let launch: {
    finish: ReturnType<typeof vi.fn>;
    finishAfterChange: ReturnType<typeof vi.fn>;
  };
  let castStub: { candidateTargets: ReturnType<typeof vi.fn> };
  let hero: GameCharacter;
  let goblin: GameCharacter;

  function fixPeerContext(): void {
    const self = {
      peerId: 'peer-self',
      userId: SELF_USER_ID,
      roomId: '',
      roomName: '',
      password: '',
      digestUserId: '',
      digestRoomName: '',
      digestPassword: '',
      isOpen: true,
      isRoom: false,
      hasPassword: false,
      session: { grade: PeerSessionGrade.UNSPECIFIED, name: '', isVisitor: false },
    } as unknown as IPeerContext;
    setPeerContextProvider({ peerContext: self, peerContexts: [self], peerIds: [self.peerId], peerId: self.peerId });
  }

  function say(text: string, sendFrom: string, fromSelf = true): ChatMessage {
    const message = new ChatMessage();
    message.text = text;
    message.sendFrom = sendFrom;
    message.from = fromSelf ? SELF_USER_ID : 'someone-else';
    message.originFrom = message.from;
    message.initialize();
    emitResourceEditMessage({
      messageIdentifier: message.identifier,
      messageTargetContext: [{ text, object: goblin }],
    });
    return message;
  }

  beforeEach(() => {
    fixPeerContext();
    PeerCursor.createMyCursor();
    launch = {
      finish: vi.fn(),
      finishAfterChange: vi.fn().mockResolvedValue(null),
    };
    castStub = { candidateTargets: vi.fn().mockReturnValue([]) };
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    TestBed.overrideProvider(BattleLaunchLoaderService, { useValue: { load: () => Promise.resolve(launch) } });
    TestBed.overrideProvider(EffectCastService, { useValue: castStub });
    TestBed.inject(BattleChatEventHandlerService);

    hero = GameCharacter.create('勇者', 1, '');
    goblin = GameCharacter.create('ゴブリン', 1, '');
  });

  afterEach(() => {
    resetPeerContextProvider();
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.delete(object, false);
    ObjectStore.instance.clearDeleteHistory();
  });

  /** The bout handed on to be played, once what plays it has been fetched. */
  async function played(): Promise<{ request: Record<string, unknown>; before: Map<string, unknown> }> {
    await vi.waitFor(() =>
      expect(launch.finish.mock.calls.length + launch.finishAfterChange.mock.calls.length).toBe(1)
    );
    return (launch.finish.mock.calls[0] ?? launch.finishAfterChange.mock.calls[0])[0];
  }

  it('plays the speaker striking the target once the numbers have moved', async () => {
    say('2d6 t:HP-10 《爆炎》《vs》', hero.identifier);

    const { request, before } = await played();
    expect(request['attacker']).toBe(hero);
    expect(request['defenders']).toEqual([goblin]);
    expect(request['effectName']).toBe('爆炎');
    expect(request['secret']).toBe(false);
    // Read as the line was heard, before the dice bot works out what it does.
    expect([...before.keys()]).toEqual([hero.identifier, goblin.identifier]);
    expect(launch.finishAfterChange).toHaveBeenCalledTimes(1);
    expect(launch.finish).not.toHaveBeenCalled();
  });

  it('plays at once a line that moves no numbers', async () => {
    say('斬りかかる《vs》', hero.identifier);

    await played();
    expect(launch.finish).toHaveBeenCalledTimes(1);
    expect(launch.finishAfterChange).not.toHaveBeenCalled();
  });

  it('keeps the numbers back for a line said in secret', async () => {
    say('st:HP-10 《vs》', hero.identifier);

    expect((await played()).request['secret']).toBe(true);
  });

  it('plays nothing for a line without the token, from somebody else, or not spoken by a piece', async () => {
    say('t:HP-10 《爆炎》', hero.identifier);
    say('t:HP-10 《vs》', hero.identifier, false);
    say('t:HP-10 《vs》', 'not-a-piece');
    await Promise.resolve();

    expect(launch.finish).not.toHaveBeenCalled();
    expect(launch.finishAfterChange).not.toHaveBeenCalled();
  });

  it('strikes nobody with themselves', async () => {
    const message = new ChatMessage();
    message.text = 't:HP-10 《vs》';
    message.sendFrom = hero.identifier;
    message.from = SELF_USER_ID;
    message.originFrom = SELF_USER_ID;
    message.initialize();
    emitResourceEditMessage({
      messageIdentifier: message.identifier,
      messageTargetContext: [{ text: message.text, object: hero }],
    });
    await Promise.resolve();

    expect(launch.finishAfterChange).not.toHaveBeenCalled();
  });
});
