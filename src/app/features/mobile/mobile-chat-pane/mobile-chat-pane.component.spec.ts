import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PanelService } from '@axe/application/ui/panel.service';
import { ChatWindowComponent } from '@axe/features/chat/chat-window/chat-window.component';
import { MobileChatPaneComponent } from '@axe/features/mobile/mobile-chat-pane/mobile-chat-pane.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'chat-window',
  template: '',
})
class ChatWindowStubComponent {}

describe('MobileChatPaneComponent', () => {
  let fixture: ComponentFixture<MobileChatPaneComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MobileChatPaneComponent],
      providers: [...TEST_PROVIDERS],
    })
      .overrideComponent(MobileChatPaneComponent, {
        remove: { imports: [ChatWindowComponent] },
        add: { imports: [ChatWindowStubComponent] },
      })
      .compileComponents();
    fixture = TestBed.createComponent(MobileChatPaneComponent);
    await fixture.whenStable();
  });

  function panel(): PanelService {
    return fixture.debugElement.injector.get(PanelService);
  }

  function scroller(): HTMLDivElement {
    return (fixture.nativeElement as HTMLElement).querySelector('div')!;
  }

  it('holds the chat window in a pane that scrolls by itself', () => {
    expect(scroller().querySelector('chat-window')).not.toBeNull();
    expect(scroller().classList.contains('overflow-y-auto')).toBe(true);
  });

  it('gives the chat a panel of its own, apart from the one the app holds', () => {
    expect(panel()).not.toBe(TestBed.inject(PanelService));
  });

  it('hands its scrolling pane to that panel, for the chat to scroll', () => {
    expect(panel().scrollablePanel).toBe(scroller());
    expect(TestBed.inject(PanelService).scrollablePanel).not.toBe(scroller());
  });
});
