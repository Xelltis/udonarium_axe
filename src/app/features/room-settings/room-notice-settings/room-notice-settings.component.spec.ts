import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { DEFAULT_SYSTEM_NOTICES, NOTICE_OFF } from '@axe/domain/chat/system-notices';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { RoomNoticeSettingsComponent } from '@axe/features/room-settings/room-notice-settings/room-notice-settings.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('RoomNoticeSettingsComponent', () => {
  let fixture: ComponentFixture<RoomNoticeSettingsComponent>;
  let component: RoomNoticeSettingsComponent;
  let battle: ChatTab;

  const choice = (kind: string): HTMLSelectElement =>
    fixture.nativeElement.querySelector(`[data-testid="room-settings-notice-${kind}"]`);
  const optionsOf = (select: HTMLSelectElement) => [...select.options].map((option) => option.textContent!.trim());
  const pick = (select: HTMLSelectElement, label: string) => {
    select.selectedIndex = optionsOf(select).indexOf(label);
    select.dispatchEvent(new Event('change'));
  };

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [RoomNoticeSettingsComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
  });

  beforeEach(async () => {
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.role = PeerRole.GameMaster;
    ChatTabList.instance.addChatTab('メイン');
    battle = ChatTabList.instance.addChatTab('戦闘');
    fixture = TestBed.createComponent(RoomNoticeSettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => {
    Config.instance.systemNotices = DEFAULT_SYSTEM_NOTICES;
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
    (Config as unknown as { _instance: Config | undefined })._instance = undefined;
  });

  it('offers each kind where it always went, every tab of the room, and nowhere', () => {
    const round = choice('round');
    const card = choice('card');

    expect(optionsOf(round)[0]).toBe('既定（一番左のタブ）');
    expect(optionsOf(card)[0]).toBe('既定（システムタブ）');
    expect(optionsOf(round)).toContain('戦闘');
    expect(optionsOf(round).at(-1)).toBe('送らない');
    expect(round.selectedIndex).toBe(0);
  });

  it('sends a kind to the tab the master picks, nowhere, or back where it always went', async () => {
    pick(choice('round'), '戦闘');
    expect(Config.instance.systemNotices).toEqual({ round: battle.identifier });

    pick(choice('bgm'), '送らない');
    pick(choice('round'), '既定（一番左のタブ）');

    expect(Config.instance.systemNotices).toEqual({ bgm: NOTICE_OFF });
  });

  it('shows a kind sent to a tab since deleted as where it always went', async () => {
    Config.instance.systemNotices = { round: 'a-tab-since-deleted' };
    fixture.detectChanges();
    await fixture.whenStable();

    expect(choice('round').selectedIndex).toBe(0);
  });

  it('lets only the master change them', async () => {
    PeerCursor.myCursor.role = PeerRole.Player;
    fixture.detectChanges();
    await fixture.whenStable();
    component.setNoticeRoute('round', battle.identifier);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(Config.instance.systemNotices).toEqual(DEFAULT_SYSTEM_NOTICES);
    expect(choice('round').disabled).toBe(true);
  });
});
