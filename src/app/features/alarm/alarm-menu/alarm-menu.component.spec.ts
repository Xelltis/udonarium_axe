import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { Network } from '@axe/core/network/network';
import { Alarm } from '@axe/domain/alarm/alarm';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { AlarmMenuComponent } from '@axe/features/alarm/alarm-menu/alarm-menu.component';
import { expectPanelDragRecovery, PanelDragTestHostComponent } from '@axe/testing/panel-drag-recovery';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('AlarmMenuComponent', () => {
  let component: AlarmMenuComponent;
  let fixture: ComponentFixture<AlarmMenuComponent>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [AlarmMenuComponent, PanelDragTestHostComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(AlarmMenuComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('lets the panel take the pointer again once the drag ends', async () => {
    await expectPanelDragRecovery(AlarmMenuComponent, {
      beforeOpen: () => {
        PeerCursor.createMyCursor();
      },
    });
  });

  it('sets no alarm for a guest on a room server, which would take it back and leave its announcement', () => {
    const alarm = { makeAlarm: vi.fn(), startAlarm: vi.fn() };
    vi.spyOn(component, 'alarm', 'get').mockReturnValue(alarm as unknown as Alarm);
    const said = vi.spyOn(TestBed.inject(ChatMessageService), 'sendSystemMessageAsLastSpeaker');
    const original = PeerCursor.myCursor;
    PeerCursor.myCursor = { peerId: 'my-peer-id', role: PeerRole.Guest } as unknown as PeerCursor;
    vi.spyOn(Network.instance, 'authorityPeerId', 'get').mockReturnValue('@authority');
    try {
      component.send();

      expect(alarm.makeAlarm).not.toHaveBeenCalled();
      expect(said).not.toHaveBeenCalled();
    } finally {
      PeerCursor.myCursor = original;
      vi.restoreAllMocks();
    }
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

  describe('selectedList', () => {
    it('returns who is picked', () => {
      component['checkedPeers'].add('peer-1');
      component.includSelf = false;
      const list = component.selectedList();
      expect(list).toContain('peer-1');
      expect(list.length).toBe(1);
    });
  });

  describe('changeAlarmTime', () => {
    it('clamps a negative value to nothing', () => {
      component.alarmTime = -10;
      component.changeAlarmTime();
      expect(component.alarmTime).toBe(0);
    });

    it('clamps anything past an hour to an hour', () => {
      component.alarmTime = 9999;
      component.changeAlarmTime();
      expect(component.alarmTime).toBe(3600);
    });
  });
});
