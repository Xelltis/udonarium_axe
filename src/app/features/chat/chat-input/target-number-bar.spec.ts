import { TestBed } from '@angular/core/testing';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { findTargetNumberSource, targetNumberChoices } from '@axe/domain/chat/target-number';
import { targetNumberBarOf } from '@axe/features/chat/chat-input/target-number-bar';

describe('targetNumberBarOf()', () => {
  let tab: ChatTab;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    tab = new ChatTab();
    tab.initialize();
  });

  afterEach(() => {
    tab.destroy();
  });

  function answer(text: string, at: number) {
    return tab.addMessage({ from: 'System-BCDice', name: '<BCDice：ゴブリン>', text, tag: 'system', timestamp: at });
  }

  it('names the speaker for a number rolled at them, and who rolled what for each answer offered', () => {
    const older = answer('DiceBot : (2D6+8) → 7[3,4]+8 → 15', 1001);
    answer('DiceBot : (2D6+5) → 9[4,5]+5 → 14 [ヒロ]', 1011);
    const speaker = { identifier: 'hero', name: 'ヒロ' };

    const bar = targetNumberBarOf(
      {
        found: findTargetNumberSource(tab, speaker),
        chosen: { total: 15, answer: older },
        choices: targetNumberChoices(tab, 8),
      },
      'ヒロ'
    );

    expect(bar.found).toEqual({
      key: 'feature.chat.input.targetNumberAimed',
      params: { total: 14, by: 'ゴブリン 2D6+5', speaker: 'ヒロ' },
    });
    expect(bar.chosen).toBe(older.identifier);
    expect(bar.choices.map((choice) => choice.label.params)).toEqual([
      { total: 14, by: 'ゴブリン 2D6+5' },
      { total: 15, by: 'ゴブリン 2D6+8' },
    ]);
    expect(bar.choices[1]).toMatchObject({ identifier: older.identifier, title: 'DiceBot : (2D6+8) → 7[3,4]+8 → 15' });
  });

  it("tells the tab's own number to beat, and that none was found where nothing has been rolled to beat", () => {
    const pinned = answer('DiceBot : (2D6+8) → 7[3,4]+8 → 15', 1001);
    tab.pinnedTargetNumber = pinned.identifier;
    const speaker = { identifier: 'hero', name: 'ヒロ' };

    const found = targetNumberBarOf({ found: findTargetNumberSource(tab, speaker), chosen: null, choices: [] }, 'ヒロ');
    const none = targetNumberBarOf({ found: null, chosen: null, choices: [] }, 'ヒロ');

    expect(found.found.key).toBe('feature.chat.input.targetNumberPinned');
    expect(found.chosen).toBe('');
    expect(none.found).toEqual({ key: 'feature.chat.input.targetNumberNotFound', params: {} });
  });
});
