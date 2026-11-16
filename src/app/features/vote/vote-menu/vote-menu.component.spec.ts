import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
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
    PeerCursor.forget();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('lets the panel take the pointer again once the drag ends', async () => {
    await expectPanelDragRecovery(VoteMenuComponent);
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

  describe('the form in a room of one', () => {
    let t: (key: string) => string;

    beforeEach(async () => {
      PeerCursor.createMyCursor();
      t = TestBed.inject(TRANSLATE_FN);
      fixture.detectChanges();
      await fixture.whenStable();
    });

    function root(): HTMLElement {
      return fixture.nativeElement as HTMLElement;
    }

    function sendButton(): HTMLButtonElement {
      return [...root().querySelectorAll('button')].find((button) =>
        button.textContent?.includes(t('feature.vote.send'))
      )!;
    }

    it('starts as a roll call, with that choice ticked', () => {
      const types = [...root().querySelectorAll<HTMLInputElement>('input[name="vm_type"]')];

      expect(types.map((type) => type.checked)).toEqual([true, false]);
    });

    it('keeps the send button off with nobody to ask, until including oneself is ticked', async () => {
      const includeSelf = root().querySelector<HTMLInputElement>('input[name="includSelf"]')!;
      expect(sendButton().disabled).toBe(true);

      includeSelf.click();
      fixture.detectChanges();
      await fixture.whenStable();
      expect(sendButton().disabled).toBe(false);

      includeSelf.click();
      fixture.detectChanges();
      await fixture.whenStable();
      expect(sendButton().disabled).toBe(true);
    });

    it('says nobody else is in the room', () => {
      expect(root().textContent).toContain(t('feature.vote.emptyPeers'));
    });
  });

  describe('selectedList', () => {
    it('returns who is picked', () => {
      component['checkedPeers'].set(['peer-1', 'peer-2']);
      component.includSelf = false;
      const list = component.selectedList();
      expect(list).toContain('peer-1');
      expect(list).toContain('peer-2');
      expect(list.length).toBe(2);
    });

    it('leaves the caller out when they ask to be left out', () => {
      component['checkedPeers'].set(['peer-1']);
      component.includSelf = false;
      const list = component.selectedList();
      expect(list).toEqual(['peer-1']);
    });
  });

  describe('selectedNum', () => {
    it('counts them', () => {
      component['checkedPeers'].set(['peer-1']);
      component.includSelf = false;
      expect(component.selectedNum()).toBe(1);
    });
  });

  describe('who is picked to start with', () => {
    it('picks the peers still in the room and leaves a dropped one out', () => {
      for (const [peerId, dropped] of [
        ['here-peer', false],
        ['disc-peer', true],
      ] as const) {
        const cursor = new PeerCursor();
        cursor.initialize();
        cursor.peerId = peerId;
        cursor.isDisConnect = dropped;
      }
      vi.spyOn(Network.instance, 'peerContexts', 'get').mockReturnValue([
        { peerId: 'here-peer' },
        { peerId: 'disc-peer' },
      ] as typeof Network.instance.peerContexts);

      component.setDefaultCheck();

      expect(component['checkedPeers']()).toEqual(['here-peer']);
    });

    it('picks and lets go of a peer from a click on their row', async () => {
      const cursor = new PeerCursor();
      cursor.initialize();
      cursor.peerId = 'row-peer';
      cursor.isDisConnect = false;
      vi.spyOn(Network.instance, 'peerContexts', 'get').mockReturnValue([
        { peerId: 'row-peer' },
      ] as typeof Network.instance.peerContexts);
      component.setDefaultCheck();
      component.includSelf = false;
      fixture.detectChanges();
      const row = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('[data-peer-id="row-peer"]')!;

      row.click();
      await fixture.whenStable();
      expect(component.selectedList()).toEqual([]);

      row.click();
      await fixture.whenStable();
      expect(component.selectedList()).toEqual(['row-peer']);
    });
  });
});
