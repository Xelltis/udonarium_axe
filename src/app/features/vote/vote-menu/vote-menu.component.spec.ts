import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { Network } from '@axe/core/network/network';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { Vote } from '@axe/domain/vote/vote';
import { VoteMenuComponent } from '@axe/features/vote/vote-menu/vote-menu.component';
import { expectPanelDragRecovery, PanelDragTestHostComponent } from '@axe/testing/panel-drag-recovery';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('VoteMenuComponent', () => {
  let component: VoteMenuComponent;
  let fixture: ComponentFixture<VoteMenuComponent>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [VoteMenuComponent, PanelDragTestHostComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(VoteMenuComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    PeerCursor.myCursor = null!;
    (PeerCursor as unknown as Record<string, unknown>)['userIdMap'] = new Map();
    (PeerCursor as unknown as Record<string, unknown>)['peerIdMap'] = new Map();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('lets the panel take the pointer again once the drag ends', async () => {
    await expectPanelDragRecovery(VoteMenuComponent);
  });

  describe('keeping track of who is picked', () => {
    it('picks somebody who was not picked', () => {
      component.voteBlockClick('peer-1');
      expect(component['checkedPeers'].has('peer-1')).toBe(true);
    });

    it('unpicks somebody who was', () => {
      component.voteBlockClick('peer-1');
      component.voteBlockClick('peer-1');
      expect(component['checkedPeers'].has('peer-1')).toBe(false);
    });

    it('keeps several peers apart', () => {
      component.voteBlockClick('peer-a');
      component.voteBlockClick('peer-b');
      expect(component['checkedPeers'].has('peer-a')).toBe(true);
      expect(component['checkedPeers'].has('peer-b')).toBe(true);

      component.voteBlockClick('peer-a');
      expect(component['checkedPeers'].has('peer-a')).toBe(false);
      expect(component['checkedPeers'].has('peer-b')).toBe(true);
    });
  });

  describe('onChangeType', () => {
    it('knows a roll call', () => {
      component.isRollCall = false;
      component.onChangeType('rollcall');
      expect(component.isRollCall).toBe(true);
    });

    it('knows a vote', () => {
      component.isRollCall = true;
      component.onChangeType('vote');
      expect(component.isRollCall).toBe(false);
    });
  });

  it('calls no vote for a guest on a room server, which would take it back and leave its announcement', () => {
    const vote = { makeVote: vi.fn(), startVote: vi.fn() };
    vi.spyOn(component, 'vote', 'get').mockReturnValue(vote as unknown as Vote);
    const said = vi.spyOn(TestBed.inject(ChatMessageService), 'sendSystemMessageAsLastSpeaker');
    PeerCursor.myCursor = { peerId: 'my-peer-id', role: PeerRole.Guest } as unknown as PeerCursor;
    vi.spyOn(Network.instance, 'authorityPeerId', 'get').mockReturnValue('@authority');

    component.send();

    expect(vote.makeVote).not.toHaveBeenCalled();
    expect(said).not.toHaveBeenCalled();
  });

  describe('hiding the answers until the vote closes', () => {
    function startWith(isRollCall: boolean, isSecret: boolean) {
      const vote = { makeVote: vi.fn(), startVote: vi.fn() };
      vi.spyOn(component, 'vote', 'get').mockReturnValue(vote as unknown as Vote);
      vi.spyOn(TestBed.inject(ChatMessageService), 'sendSystemMessageAsLastSpeaker').mockReturnValue(undefined!);
      PeerCursor.myCursor = { peerId: 'my-peer-id' } as unknown as PeerCursor;
      component.isRollCall = isRollCall;
      component.isSecret = isSecret;
      component.voteTitle = '方針';
      component.send();
      return vote.makeVote.mock.calls[0];
    }

    function secretOption(): Element | null {
      return fixture.nativeElement.querySelector('[data-testid="vote-menu-secret"]');
    }

    it('starts with the answers in the open', () => {
      expect(component.isSecret).toBe(false);
    });

    it('starts a vote that hides its answers when asked to', () => {
      expect(startWith(false, true)[6]).toBe(true);
    });

    it('starts one in the open when not asked to', () => {
      expect(startWith(false, false)[6]).toBe(false);
    });

    it('offers the option for a vote', () => {
      component.isRollCall = false;
      fixture.detectChanges();

      expect(secretOption()).not.toBeNull();
    });

    it('does not offer it for a roll call', () => {
      component.isRollCall = true;
      fixture.detectChanges();

      expect(secretOption()).toBeNull();
    });
  });

  describe('selectedList', () => {
    it('returns who is picked', () => {
      component['checkedPeers'].add('peer-1');
      component['checkedPeers'].add('peer-2');
      component.includSelf = false;
      const list = component.selectedList();
      expect(list).toContain('peer-1');
      expect(list).toContain('peer-2');
      expect(list.length).toBe(2);
    });

    it('leaves the caller out when they ask to be left out', () => {
      component['checkedPeers'].add('peer-1');
      component.includSelf = false;
      const list = component.selectedList();
      expect(list).toEqual(['peer-1']);
    });
  });

  describe('selectedNum', () => {
    it('counts them', () => {
      component['checkedPeers'].add('peer-1');
      component.includSelf = false;
      expect(component.selectedNum()).toBe(1);
    });
  });

  describe('isPeerIsDisConnect', () => {
    it('is false for a peer still connected', () => {
      const cursor = new PeerCursor();
      cursor.initialize();
      cursor.peerId = 'connected-peer';
      cursor.isDisConnect = false;

      expect(component.isPeerIsDisConnect('connected-peer')).toBe(false);
    });

    it('is true for one that has dropped', () => {
      const cursor = new PeerCursor();
      cursor.initialize();
      cursor.peerId = 'disconnected-peer';
      cursor.isDisConnect = true;

      expect(component.isPeerIsDisConnect('disconnected-peer')).toBe(true);
    });

    it('is true for one that was never there', () => {
      expect(component.isPeerIsDisConnect('nonexistent')).toBe(true);
    });
  });

  describe('setDefaultCheck', () => {
    it('leaves a dropped peer out of the picked', () => {
      const cursor = new PeerCursor();
      cursor.initialize();
      cursor.peerId = 'disc-peer';
      cursor.isDisConnect = true;

      component.setDefaultCheck();

      expect(component['checkedPeers'].has('disc-peer')).toBe(false);
    });
  });
});
