import { TestBed } from '@angular/core/testing';
import { GameCharacter } from '@axe/domain/character/game-character';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { CharacterMemoComponent } from '@axe/features/character/character-memo/character-memo.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('CharacterMemoComponent', () => {
  let character: GameCharacter;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [CharacterMemoComponent], providers: [...TEST_PROVIDERS] });
    character = GameCharacter.create('メモ持ち', 1, '');
  });

  afterEach(() => {
    character.destroy();
  });

  async function open() {
    const fixture = TestBed.createComponent(CharacterMemoComponent);
    fixture.componentInstance.target.set(character);
    fixture.detectChanges();
    await fixture.whenStable();
    const text = (fixture.nativeElement as HTMLElement).querySelector<HTMLTextAreaElement>(
      '[data-testid="character-memo-text"]'
    )!;
    return { fixture, text };
  }

  it('shows the memo kept with the piece, and writes what is typed into it', async () => {
    character.note = 'ロープ';
    const { text } = await open();

    expect(text.value).toBe('ロープ');
    text.value = 'ロープ\n通行証';
    text.dispatchEvent(new Event('input'));

    expect(character.note).toBe('ロープ\n通行証');
  });

  it('starts the memo on the first thing typed into an empty one', async () => {
    const { text } = await open();

    text.value = '鍵';
    text.dispatchEvent(new Event('input'));

    expect(character.innerNote).not.toBeNull();
    expect(character.note).toBe('鍵');
  });

  it('lets a guest read it but not write in it', async () => {
    character.note = 'ロープ';
    PeerCursor.myCursor = { role: PeerRole.Guest, identifier: 'guest-cursor' } as PeerCursor;
    const { text } = await open();

    expect(text.readOnly).toBe(true);
    text.value = '書き換え';
    text.dispatchEvent(new Event('input'));
    expect(character.note).toBe('ロープ');
  });
});
