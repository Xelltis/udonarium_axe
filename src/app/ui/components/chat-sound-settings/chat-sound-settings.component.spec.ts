import { TestBed } from '@angular/core/testing';
import { ChatPreferencesService } from '@axe/application/chat/chat-preferences.service';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { UiChatSoundSettingsComponent } from '@axe/ui/components/chat-sound-settings/chat-sound-settings.component';

describe('UiChatSoundSettingsComponent', () => {
  function make(): HTMLElement {
    TestBed.configureTestingModule({ imports: [UiChatSoundSettingsComponent], providers: [...TEST_PROVIDERS] });
    const tab = new ChatTab();
    tab.name = 'メイン';
    tab.initialize();
    ChatTabList.instance.appendChild(tab);
    const fixture = TestBed.createComponent(UiChatSoundSettingsComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => localStorage.removeItem('chat-preferences'));

  afterEach(() => {
    (ChatTabList as unknown as { _instance: ChatTabList | undefined })._instance = undefined;
    localStorage.removeItem('chat-preferences');
  });

  it('turns the note for every tab on, kept with the chat’s other settings in this browser', () => {
    const root = make();

    root.querySelector<HTMLInputElement>('input[name="chatSoundEnabled-all"]')!.click();

    expect(TestBed.inject(ChatPreferencesService).soundOfTab('メイン').enabled).toBe(true);
  });

  it('offers every note there is to choose from', () => {
    const root = make();

    const options = root.querySelectorAll('select[name="chatSoundType-all"] option');

    expect(options).toHaveLength(5);
  });
});
