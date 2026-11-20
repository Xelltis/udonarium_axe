import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { defaultSwitchDefinition } from '@axe/domain/tabletop/board-switch/switch-definition';
import { SwitchDefinitionFieldsComponent } from '@axe/features/tabletop/board-switch/switch-definition-fields.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('SwitchDefinitionFieldsComponent', () => {
  let fixture: ComponentFixture<SwitchDefinitionFieldsComponent>;

  function offeredTabs(): string[] {
    const select = fixture.nativeElement.querySelector('[data-testid="board-switch-tab"]') as HTMLSelectElement;
    return [...select.options].slice(1).map((option) => option.textContent?.trim() ?? '');
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [SwitchDefinitionFieldsComponent], providers: [...TEST_PROVIDERS] });
    PeerCursor.createMyCursor().role = PeerRole.Player;
    ChatTabList.instance.addChatTab('メイン');
    ChatTabList.instance.addChatTab('GM卓').plCanView = false;
    ChatTabList.instance.ensureSystemTab();
    fixture = TestBed.createComponent(SwitchDefinitionFieldsComponent);
    fixture.componentRef.setInput('definition', defaultSwitchDefinition());
    fixture.detectChanges();
  });

  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
    PeerCursor.myCursor = null!;
  });

  it('offers a switch only the tabs this seat may read, every one of them to the game master, and never the noticeboard', () => {
    expect(offeredTabs()).toEqual(['メイン']);

    PeerCursor.myCursor.role = PeerRole.GameMaster;
    fixture.detectChanges();

    expect(offeredTabs()).toEqual(['メイン', 'GM卓']);
  });
});
