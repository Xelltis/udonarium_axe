import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GameCharacter } from '@axe/domain/character/game-character';
import type { ChatOutgoing } from '@axe/domain/chat/chat-outgoing';
import { DiceBot } from '@axe/domain/dice/dice-bot';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { ChatStreamInputComponent } from '@axe/features/chat/chat-stream/chat-stream-input.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import type GameSystemClass from 'bcdice/lib/game_system';

describe('ChatStreamInputComponent', () => {
  let fixture: ComponentFixture<ChatStreamInputComponent>;
  let component: ChatStreamInputComponent;
  let said: ChatOutgoing[];
  const system = { ID: 'DiceBot' } as unknown as GameSystemClass;

  beforeEach(async () => {
    PeerCursor.createMyCursor();
    TestBed.configureTestingModule({ imports: [ChatStreamInputComponent], providers: [...TEST_PROVIDERS] });
    vi.spyOn(DiceBot, 'gameSystemForLineAsync').mockResolvedValue(system);
    fixture = TestBed.createComponent(ChatStreamInputComponent);
    component = fixture.componentInstance;
    said = [];
    component.said.subscribe((line) => said.push(line));
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    vi.restoreAllMocks();
  });

  const box = () => fixture.nativeElement.querySelector('[data-testid="chat-stream-text"]') as HTMLTextAreaElement;
  const press = (init: KeyboardEventInit) => {
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...init });
    box().dispatchEvent(event);
    return event;
  };

  it('offers this seat first, then the characters it may speak as', () => {
    const hero = GameCharacter.create('ヒロ', 1, '');
    try {
      fixture.detectChanges();

      const names = component.speakers().map((speaker) => speaker.name);
      expect(names[0]).toContain(PeerCursor.myCursor.name);
      expect(names).toContain('ヒロ');
    } finally {
      hero.destroy();
    }
  });

  it('sends the line on Enter as the speaker chosen, and empties the box', async () => {
    const hero = GameCharacter.create('ヒロ', 1, '');
    try {
      component.sendFrom.set(hero.identifier);
      component.text.set('2d6 いくぞ');
      fixture.detectChanges();

      expect(press({}).defaultPrevented).toBe(true);
      await fixture.whenStable();

      expect(component.text()).toBe('');
      expect(said).toHaveLength(1);
      expect(said[0]).toMatchObject({ text: '2d6 いくぞ', sendFrom: hero.identifier, sendTo: '', gameSystem: system });
    } finally {
      hero.destroy();
    }
  });

  it('starts a new line on Shift+Enter, and sends nothing while a word is being made', () => {
    component.text.set('こんにちは');
    fixture.detectChanges();

    expect(press({ shiftKey: true }).defaultPrevented).toBe(false);
    expect(press({ isComposing: true }).defaultPrevented).toBe(false);
    expect(component.text()).toBe('こんにちは');
  });

  it('sends as this seat once the character chosen is gone', async () => {
    const hero = GameCharacter.create('ヒロ', 1, '');
    component.sendFrom.set(hero.identifier);
    hero.destroy();
    component.text.set('まだいるよ');
    fixture.detectChanges();

    component.send();
    await fixture.whenStable();

    expect(said[0].sendFrom).toBe(PeerCursor.myCursor.identifier);
  });

  it('takes no line where the reader may not speak in the tab', async () => {
    fixture.componentRef.setInput('canSpeak', false);
    component.text.set('聞こえる？');
    fixture.detectChanges();
    await fixture.whenStable();

    component.send();

    expect(box().disabled).toBe(true);
    expect(said).toEqual([]);
  });
});
