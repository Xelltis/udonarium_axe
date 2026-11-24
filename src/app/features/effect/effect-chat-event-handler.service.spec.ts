import { TestBed } from '@angular/core/testing';
import { EffectCastService } from '@axe/application/effect/effect-cast.service';
import { EffectLibraryService } from '@axe/application/effect/effect-library.service';
import { ModelActsService } from '@axe/application/tabletop/model-acts.service';
import { emitResourceEditMessage } from '@axe/core/event/domain-events';
import { IPeerContext } from '@axe/core/network/peer-context';
import { resetPeerContextProvider, setPeerContextProvider } from '@axe/core/network/peer-context-source';
import { PeerSessionGrade } from '@axe/core/network/peer-session-state';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { EffectChatEventHandlerService } from '@axe/features/effect/effect-chat-event-handler.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('EffectChatEventHandlerService', () => {
  let castStub: {
    fire: ReturnType<typeof vi.fn>;
    playHere: ReturnType<typeof vi.fn>;
    candidateTargets: ReturnType<typeof vi.fn>;
  };
  let preset: EffectPreset;
  let target: GameCharacter;
  let caster: GameCharacter;

  const SELF_USER_ID = 'user-self';

  /** Whose line it is comes from the user on the peer context, pinned so nothing around it can sway the answer. */
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

  function addMessage(text: string, sendFrom: string, fromSelf = true, to = ''): ChatMessage {
    const message = new ChatMessage();
    message.text = text;
    message.to = to;
    message.sendFrom = sendFrom;
    message.from = fromSelf ? SELF_USER_ID : 'someone-else';
    message.originFrom = message.from;
    message.initialize();
    return message;
  }

  beforeEach(() => {
    fixPeerContext();
    PeerCursor.createMyCursor();
    castStub = { fire: vi.fn(), playHere: vi.fn(), candidateTargets: vi.fn().mockReturnValue([]) };
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    TestBed.overrideProvider(EffectCastService, { useValue: castStub });
    TestBed.inject(EffectChatEventHandlerService);

    preset = new EffectPreset();
    preset.name = '爆炎';
    preset.initialize();

    target = GameCharacter.create('的', 1, '');
    caster = GameCharacter.create('術者', 1, '');
    castStub.candidateTargets.mockReturnValue([target]);
  });

  afterEach(() => {
    resetPeerContextProvider();
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.delete(object, false);
    ObjectStore.instance.clearDeleteHistory();
  });

  it('fires from a token in the line', () => {
    const message = addMessage('2d6+3 t:HP-10 《爆炎》', caster.identifier);

    // The premises are checked first, so a failure to fire says which condition turned it away.
    expect(message.isSendFromSelf).toBe(true);
    expect(message.isSystem).toBe(false);
    expect(TestBed.inject(EffectLibraryService).findByName('爆炎')).toBe(preset);

    emitResourceEditMessage({ messageIdentifier: message.identifier, messageTargetContext: null });

    expect(castStub.fire).toHaveBeenCalledTimes(1);
    const [firedPreset, targets, firedCaster] = castStub.fire.mock.calls[0];
    expect(firedPreset).toBe(preset);
    expect(targets).toEqual([target]);
    // It is cast by whoever spoke the line, not by whatever is selected.
    expect(firedCaster).toBe(caster);
  });

  it('plays the effect and the motion of a whispered line on this screen alone', () => {
    const toAll = vi.spyOn(TestBed.inject(ModelActsService), 'playForAll').mockImplementation(() => undefined);
    const here = vi.spyOn(TestBed.inject(ModelActsService), 'play').mockImplementation(() => undefined);
    const message = addMessage('《動き:Attack》《爆炎》', caster.identifier, true, 'gm-user');

    emitResourceEditMessage({ messageIdentifier: message.identifier, messageTargetContext: null });

    expect(castStub.fire).not.toHaveBeenCalled();
    expect(castStub.playHere).toHaveBeenCalledWith(preset, [target], caster);
    expect(toAll).not.toHaveBeenCalled();
    expect(here.mock.calls).toEqual([[caster.identifier, 'Attack']]);
  });

  it('plays the effect and the motion of a line in a tab players may not read on this screen alone', () => {
    const toAll = vi.spyOn(TestBed.inject(ModelActsService), 'playForAll').mockImplementation(() => undefined);
    const here = vi.spyOn(TestBed.inject(ModelActsService), 'play').mockImplementation(() => undefined);
    const hidden = new ChatTab();
    hidden.initialize();
    hidden.plCanView = false;
    const message = addMessage('《動き:Attack》《爆炎》', caster.identifier);
    hidden.appendChild(message);

    emitResourceEditMessage({ messageIdentifier: message.identifier, messageTargetContext: null });

    expect(castStub.fire).not.toHaveBeenCalled();
    expect(castStub.playHere).toHaveBeenCalledOnce();
    expect(toAll).not.toHaveBeenCalled();
    expect(here).toHaveBeenCalledOnce();
    hidden.destroy();
  });

  it('fires nothing from the line of a guest, who shows nothing on anybody’s table', () => {
    PeerCursor.myCursor.role = PeerRole.Guest;
    const message = addMessage('t:HP-10 《爆炎》', caster.identifier);

    emitResourceEditMessage({ messageIdentifier: message.identifier, messageTargetContext: null });
    expect(castStub.fire).not.toHaveBeenCalled();

    PeerCursor.myCursor.role = PeerRole.Player;
    emitResourceEditMessage({ messageIdentifier: message.identifier, messageTargetContext: null });
    expect(castStub.fire).toHaveBeenCalledTimes(1);
  });

  it('leaves the effect of a line played on the battle stage to the stage', () => {
    const message = addMessage('t:HP-10 《爆炎》《vs》', caster.identifier);

    emitResourceEditMessage({ messageIdentifier: message.identifier, messageTargetContext: null });

    expect(castStub.fire).not.toHaveBeenCalled();
  });

  it('fires the effect of a line the battle stage does not take, from a speaker who is no piece', () => {
    const message = addMessage('t:HP-10 《爆炎》《vs》', PeerCursor.myCursor.identifier);

    emitResourceEditMessage({ messageIdentifier: message.identifier, messageTargetContext: null });

    expect(castStub.fire).toHaveBeenCalledTimes(1);
    expect(castStub.fire.mock.calls[0][1]).toEqual([target]);
  });

  it('fires the effect of a line the battle stage does not take, with nobody but the speaker to strike', () => {
    castStub.candidateTargets.mockReturnValue([caster]);
    const message = addMessage('《爆炎》《vs》', caster.identifier);

    emitResourceEditMessage({ messageIdentifier: message.identifier, messageTargetContext: null });

    expect(castStub.fire).toHaveBeenCalledTimes(1);
  });

  it('takes the target of the resource change first', () => {
    const message = addMessage('《爆炎》', caster.identifier);

    emitResourceEditMessage({
      messageIdentifier: message.identifier,
      messageTargetContext: [{ text: 'HP-10', object: target }],
    });

    expect(castStub.fire.mock.calls[0][1]).toEqual([target]);
  });

  it('does nothing without a token', () => {
    const message = addMessage('2d6+3 t:HP-10', caster.identifier);

    emitResourceEditMessage({ messageIdentifier: message.identifier, messageTargetContext: null });

    expect(castStub.fire).not.toHaveBeenCalled();
  });

  it('does nothing for a name it does not know', () => {
    const message = addMessage('《存在しない演出》', caster.identifier);

    emitResourceEditMessage({ messageIdentifier: message.identifier, messageTargetContext: null });

    expect(castStub.fire).not.toHaveBeenCalled();
  });

  it('does not fire on somebody elses line', () => {
    // Run at every end, the effect would play once per player.
    const message = addMessage('《爆炎》', caster.identifier, false);

    emitResourceEditMessage({ messageIdentifier: message.identifier, messageTargetContext: null });

    expect(castStub.fire).not.toHaveBeenCalled();
  });

  describe('a token that asks for a motion', () => {
    it('has the model of the piece that spoke play it on every table, and fires no effect by that name', () => {
      const played = vi.spyOn(TestBed.inject(ModelActsService), 'playForAll').mockImplementation(() => undefined);
      const message = addMessage('やあ《動き:Wave》', caster.identifier);

      emitResourceEditMessage({ messageIdentifier: message.identifier, messageTargetContext: null });

      expect(played.mock.calls).toEqual([[caster.identifier, 'Wave']]);
      expect(castStub.fire).not.toHaveBeenCalled();
    });

    it('plays the first motion asked for alone, beside the effect the line fires', () => {
      const played = vi.spyOn(TestBed.inject(ModelActsService), 'playForAll').mockImplementation(() => undefined);
      const message = addMessage('《動き:攻撃》《爆炎》《動き:Bow》', caster.identifier);

      emitResourceEditMessage({ messageIdentifier: message.identifier, messageTargetContext: null });

      expect(played.mock.calls).toEqual([[caster.identifier, '攻撃']]);
      expect(castStub.fire).toHaveBeenCalledTimes(1);
    });

    it('plays nothing for a speaker who is no piece, for a guest, nor for somebody else’s line', () => {
      const played = vi.spyOn(TestBed.inject(ModelActsService), 'playForAll').mockImplementation(() => undefined);
      const mine = addMessage('《動き:Wave》', PeerCursor.myCursor.identifier);
      const theirs = addMessage('《動き:Wave》', caster.identifier, false);
      emitResourceEditMessage({ messageIdentifier: mine.identifier, messageTargetContext: null });
      emitResourceEditMessage({ messageIdentifier: theirs.identifier, messageTargetContext: null });

      PeerCursor.myCursor.role = PeerRole.Guest;
      const asGuest = addMessage('《動き:Wave》', caster.identifier);
      emitResourceEditMessage({ messageIdentifier: asGuest.identifier, messageTargetContext: null });
      PeerCursor.myCursor.role = PeerRole.Player;

      expect(played).not.toHaveBeenCalled();
    });
  });
});
