import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModalService } from '@axe/application/ui/modal.service';
import { SkinService } from '@axe/application/ui/skin.service';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import {
  ChatColorSettingComponent,
  PRESET_COLUMNS,
} from '@axe/features/chat/chat-color-setting/chat-color-setting.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { autoChatBubble } from '@axe/ui/pipes/chat-color-style.pipe';

describe('ChatColorSettingComponent', () => {
  let fixture: ComponentFixture<ChatColorSettingComponent>;
  let component: ChatColorSettingComponent;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [ChatColorSettingComponent],
      providers: [...TEST_PROVIDERS, { provide: ModalService, useValue: { option: {} } }],
    }).compileComponents();

    PeerCursor.createMyCursor().name = 'Somebody';
    fixture = TestBed.createComponent(ChatColorSettingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('shows the colour on both sides of the page, so the reader sees what it costs on either', () => {
    const host = fixture.nativeElement as HTMLElement;
    const bubbles = host.querySelectorAll<HTMLElement>('[style*="background-color"]');

    expect(component.themes).toEqual(['light', 'dark']);
    // Three colours on each of the two themes, plus the panel each set of three sits on.
    expect(bubbles.length).toBeGreaterThanOrEqual(component.themes.length * component.slots.length);
  });

  it('reads the sample under the name the message would carry', () => {
    expect(component.speakerName).toBe('Somebody');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Somebody');
  });

  it('offers every colour, whichever one is being worked on', () => {
    const host = fixture.nativeElement as HTMLElement;
    const tabs = host.querySelectorAll<HTMLButtonElement>('button');

    expect(component.editing()).toBe(0);
    expect(tabs.length).toBeGreaterThanOrEqual(component.slots.length);
  });

  it('works on whichever colour was asked for', () => {
    component.editing.set(2);
    fixture.detectChanges();

    const picker = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('input[type="color"]');

    expect(picker?.id).toBe('chat-color-2');
  });

  it('offers colours to pick without opening a wheel', () => {
    const host = fixture.nativeElement as HTMLElement;
    const swatches = host.querySelectorAll('button[title^="#"]');

    expect(component.presets.length).toBeGreaterThan(0);
    expect(swatches.length).toBe(component.presets.length);
  });

  it('fills whole rows, a palette with one swatch hanging off the end looking unfinished', () => {
    const host = fixture.nativeElement as HTMLElement;
    const palette = host.querySelector('button[title^="#"]')?.parentElement;

    expect(component.presets.length % PRESET_COLUMNS).toBe(0);
    // The row width is written into the layout as a class, so it has to agree with the count.
    expect(palette?.className).toContain('grid-cols-' + PRESET_COLUMNS);
  });

  it('offers no colour twice', () => {
    const seen = component.presets.map((preset) => preset.toLowerCase());

    expect(new Set(seen).size).toBe(seen.length);
  });

  it('takes a colour straight off the palette', () => {
    component.changeColor(component.presets[3], 0);

    expect(component.chatColorCode(0)).toBe(component.presets[3]);
  });

  it('matches a colour whichever case it was written in', () => {
    expect(component.sameColor('#FF0000', '#ff0000')).toBe(true);
    expect(component.sameColor('#FF0000', '#00ff00')).toBe(false);
  });

  it('writes no contrast ratio, a number the reader has no way to read', () => {
    const words = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(words).not.toMatch(/\d+(\.\d+)?\s*:\s*1/);
  });

  it('says what each swatch is for rather than leaving it to be guessed', () => {
    const host = fixture.nativeElement as HTMLElement;
    const text = host.querySelector<HTMLInputElement>('input[id="chat-color-0"]');
    const bubble = host.querySelector<HTMLInputElement>('input[name="chat-bubble-light-0"]');

    expect(text?.title).toBeTruthy();
    expect(bubble?.title).toBeTruthy();
  });

  it('offers to fix only the pairing that cannot be read', () => {
    component.changeColor('#808080', 0);
    component.changeBubble('#808080', 0, 'light');
    fixture.detectChanges();

    expect(component.isHardToRead(0, 'light')).toBe(true);
    expect(component.isHardToRead(1, 'light')).toBe(false);
  });

  it('puts a bubble the colour can be read on when the fix is taken up', () => {
    component.changeColor('#808080', 0);
    component.changeBubble('#808080', 0, 'light');

    component.autoAdjust(0, 'light');

    expect(component.isHardToRead(0, 'light')).toBe(false);
  });

  describe('a ladder that is not the one on screen', () => {
    it('works the bubble out against that ladder, not against whichever is showing', () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [ChatColorSettingComponent],
        providers: [
          ...TEST_PROVIDERS,
          { provide: ModalService, useValue: { option: {} } },
          { provide: SkinService, useValue: { toneOf: (mode: 'light' | 'dark') => (mode === 'light' ? 40 : 62) } },
        ],
      });
      PeerCursor.createMyCursor().name = 'Somebody';
      const scoped = TestBed.createComponent(ChatColorSettingComponent).componentInstance;
      scoped.myPeer.chatColorCode[0] = '#000000';

      expect(autoChatBubble('#000000', 'dark', 62)).not.toBe(autoChatBubble('#000000', 'dark'));
      expect(autoChatBubble('#000000', 'light', 40)).not.toBe(autoChatBubble('#000000', 'light'));
      expect(scoped.shownBubble(0, 'light')).toBe(autoChatBubble('#000000', 'light', 40));
      expect(scoped.shownBubble(0, 'dark')).toBe(autoChatBubble('#000000', 'dark', 62));
    });
  });

  it('gives the bubble back to being worked out', () => {
    component.changeBubble('#123456', 1, 'dark');
    expect(component.bubbleCode(1, 'dark')).toBe('#123456');

    component.clearBubble(1, 'dark');

    expect(component.bubbleCode(1, 'dark')).toBe('');
    expect(component.shownBubble(1, 'dark')).not.toBe('');
  });
});
