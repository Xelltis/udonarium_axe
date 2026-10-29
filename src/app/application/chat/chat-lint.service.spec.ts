import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ChatLintService, type ChatLintSource } from '@axe/application/chat/chat-lint.service';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DiceBot } from '@axe/domain/dice/dice-bot';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('ChatLintService', () => {
  let service: ChatLintService;
  let speaker: GameCharacter;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    service = TestBed.inject(ChatLintService);
    speaker = GameCharacter.create('戦士', 1, '');
  });

  afterEach(() => {
    speaker.destroy();
  });

  function watch(text: string, overrides: Partial<ChatLintSource> = {}) {
    const source = {
      text: signal(text),
      sendFrom: signal(speaker.identifier),
      gameType: signal('DiceBot'),
      path: 'chatWindow' as const,
      ...overrides,
    };
    return { source, session: service.watch(source) };
  }

  const codesOf = (session: ReturnType<ChatLintService['watch']>) => session.diagnostics().map((found) => found.code);

  it('checks against the piece spoken as, and again when the speaker changes', () => {
    const sendFrom = signal(speaker.identifier);
    const { session } = watch(':HP-5', { sendFrom });
    expect(codesOf(session)).toEqual([]);

    sendFrom.set('');
    expect(codesOf(session)).toEqual(['edit.noSpeaker']);
  });

  it('checks again when the text changes', () => {
    const text = signal(':HP-5');
    const { session } = watch('', { text });
    text.set(':気力-5');
    expect(codesOf(session)).toEqual(['res.unknownStatus']);
  });

  it('shows what a reference is filled in with', () => {
    const { session } = watch('{HP}');
    const [annotation] = session.annotations();
    expect(annotation).toMatchObject({ kind: 'value', from: 0, to: 4 });
    expect(annotation.label).toBe(String(speaker.status.getValue('HP', 'now')));
  });

  it('checks a roll once the game system has arrived', async () => {
    const notHereYet = vi.spyOn(DiceBot, 'loadedGameSystem').mockReturnValue(null);
    try {
      const { session } = watch('CC<=abc', { gameType: signal('Cthulhu7th') });
      expect(codesOf(session)).toEqual([]);

      await vi.waitFor(() => expect(codesOf(session)).toEqual(['dice.unrollable']), { timeout: 5000 });
    } finally {
      notHereYet.mockRestore();
    }
  });

  it('rolls each line of a long palette once, however often it is checked again', () => {
    const roll = vi.fn((command: string) => ({ text: `(${command}) ＞ 7` }));
    const system = { ID: 'FakeSystem', COMMAND_PATTERN: null, eval: roll };
    const loaded = vi
      .spyOn(DiceBot, 'loadedGameSystem')
      .mockReturnValue(system as unknown as ReturnType<typeof DiceBot.loadedGameSystem>);
    try {
      const lines = Array.from({ length: 100 }, (_, index) => `2d6+${index} 技能${index}`).join('\n');
      const text = signal(lines);
      const { session } = watch('', { text, path: 'palette', mode: 'palette' });
      session.diagnostics();
      session.annotations();
      const rolled = roll.mock.calls.length;

      text.set(`${lines}\n`);
      session.diagnostics();
      session.annotations();

      expect(rolled).toBeGreaterThanOrEqual(100);
      expect(roll.mock.calls.length).toBe(rolled);
    } finally {
      loaded.mockRestore();
    }
  });

  it('reads the variables written into a palette being edited', () => {
    const { session } = watch('//強さ=3\n{強さ} 殴る\n{弱さ}', { path: 'palette', mode: 'palette' });
    expect(session.diagnostics().map((found) => [found.code, found.params?.['name']])).toEqual([
      ['ref.unknownEmptied', '弱さ'],
    ]);
  });
});
