import { TestBed } from '@angular/core/testing';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { VoteService } from '@axe/application/vote/vote.service';
import { Network } from '@axe/core/network/network';
import { ObjectStore } from '@axe/core/sync/object-store';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { Vote } from '@axe/domain/vote/vote';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('VoteService', () => {
  let service: VoteService;
  let vote: Vote;
  let said: ReturnType<typeof vi.fn>;
  let guest: PeerCursor;

  const call = (asked: string[]) => ({
    rollCall: false,
    title: ' 行き先 ',
    choices: [' 北', '', '南 '],
    asked,
    secret: false,
    tabIdentifier: '',
  });

  beforeEach(() => {
    said = vi.fn();
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    TestBed.overrideProvider(ChatMessageService, { useValue: { sendSystemMessageAsLastSpeaker: said } });
    service = TestBed.inject(VoteService);
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.peerId = 'my-peer';
    PeerCursor.myCursor.role = PeerRole.Player;
    guest = new PeerCursor();
    guest.peerId = 'guest-peer';
    guest.role = PeerRole.Guest;
    guest.initialize();
    vote = new Vote('Vote');
    vote.initialize();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
    PeerCursor.myCursor = null!;
  });

  it('starts a vote with this seat in the chair, asking only the seats that may answer, and says so', () => {
    expect(service.start(call(['my-peer', 'guest-peer', 'my-peer']))).toBeNull();

    expect([vote.chairId, vote.voteTitle, vote.targetPeerId, vote.choices]).toEqual([
      'my-peer',
      '行き先',
      ['my-peer'],
      ['北', '南'],
    ]);
    expect(said).toHaveBeenCalledOnce();
  });

  it('says the room holds no vote yet, rather than that none is being answered, where there is none to start', () => {
    ObjectStore.instance.remove(vote);

    expect(service.start(call(['my-peer']))).toBe('missing');
    expect(said).not.toHaveBeenCalled();
  });

  it('starts none that would ask nobody but a guest', () => {
    expect(service.start(call(['guest-peer']))).toBe('noSeat');
    expect(vote.initTimeStamp).toBe(0);
  });

  it('lets a guest start, answer and end nothing, among peers as on a room server', () => {
    vote.makeVote('my-peer', '行き先', ['my-peer'], ['北'], false);
    PeerCursor.myCursor.role = PeerRole.Guest;
    const started = vote.initTimeStamp;

    for (const authority of [null, '@authority']) {
      vi.spyOn(Network.instance, 'authorityPeerId', 'get').mockReturnValue(authority);
      expect(service.mayCall()).toBe(false);
      expect(service.start(call(['my-peer']))).toBe('guest');
      expect(service.mayAnswer()).toBe(false);
      expect(service.answer('北')).toBe('guest');
      expect(service.answer(null)).toBe('guest');
    }

    expect([vote.initTimeStamp, vote.isVoteEnd('my-peer')]).toEqual([started, false]);
    expect(said).not.toHaveBeenCalled();
  });

  it('takes an answer once, from a seat asked, among the choices', () => {
    vote.makeVote('chair', '行き先', ['my-peer'], ['北', '南'], false);

    expect(service.answer('東')).toBe('notOffered');
    expect(service.answer('北')).toBeNull();
    expect(service.answer('南')).toBe('answered');
    expect(PeerCursor.myCursor.voteAnswer).toBe(0);

    vote.makeVote('chair', '点呼', ['someone-else'], ['OK'], true);
    expect(service.answer('OK')).toBe('notAsked');
  });

  it('lets only the chair end a vote early, and a chair made a guest on a room server not even then', () => {
    vote.makeVote('chair', '行き先', ['my-peer'], ['北'], false);
    expect(service.finish()).toBe('notChair');

    vote.chairId = 'my-peer';
    PeerCursor.myCursor.role = PeerRole.Guest;
    vi.spyOn(Network.instance, 'authorityPeerId', 'get').mockReturnValue('@authority');
    expect(service.finish()).toBe('guest');
    expect(vote.isFinish).toBe(false);

    vi.spyOn(Network.instance, 'authorityPeerId', 'get').mockReturnValue(null);
    expect(service.finish()).toBeNull();
    expect(vote.isFinish).toBe(true);
  });
});
