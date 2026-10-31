import { TestBed } from '@angular/core/testing';
import { GameSystemPrefetchService } from '@axe/application/dice/game-system-prefetch.service';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ChatSyntaxSourceService } from '@axe/features/chat/chat-input/chat-syntax-source.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('ChatSyntaxSourceService', () => {
  let speaker: GameCharacter;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    speaker = GameCharacter.create('戦士', 1, '');
  });

  afterEach(() => {
    speaker.destroy();
    vi.restoreAllMocks();
  });

  it('offers the speaker’s names as a line is written without fetching or rolling a game system', () => {
    const systemFor = vi.spyOn(TestBed.inject(GameSystemPrefetchService), 'systemFor');

    const words = TestBed.inject(ChatSyntaxSourceService).completionWordsFor(speaker.identifier);

    expect(words.statuses.length).toBeGreaterThan(0);
    expect(systemFor).not.toHaveBeenCalled();
  });
});
