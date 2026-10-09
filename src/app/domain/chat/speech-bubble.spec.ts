import { ChatMessage } from '@axe/domain/chat/chat-message';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { OUT_OF_STORY_TAG } from '@axe/domain/chat/constants';
import {
  answeredLineKeys,
  isSpeechLine,
  SPEECH_BUBBLE_MAX_LETTERS,
  speechBubbleContentOf,
  speechBubbleDurationMs,
  speechLineKey,
  speechTextOf,
} from '@axe/domain/chat/speech-bubble';
import { joinStampLine } from '@axe/domain/chat/stamp-line';

describe('the bubble over a speaking piece', () => {
  function line(fields: Partial<Record<string, unknown>> = {}, text = 'こんにちは'): ChatMessage {
    const message = new ChatMessage();
    message.text = text;
    Object.assign(message, { from: 'me', ...fields });
    return message;
  }

  describe('the words it shows', () => {
    it('shows only what is quoted where the line quotes, and the whole line otherwise', () => {
      expect(speechTextOf('剣を抜く。「かかってこい！」と叫ぶ')).toBe('かかってこい！');
      expect(speechTextOf('「行くぞ」「おう」')).toBe('行くぞ\nおう');
      expect(speechTextOf('剣を抜く')).toBe('剣を抜く');
      expect(speechTextOf('「」だけ')).toBe('「」だけ');
    });

    it('reads ruby as the words it sits on', () => {
      expect(speechTextOf('|炎《ほのお》の剣')).toBe('炎の剣');
    });

    it('cuts the words short past the letters or the lines it holds', () => {
      const long = 'あ'.repeat(SPEECH_BUBBLE_MAX_LETTERS + 5);
      expect(speechTextOf(long)).toBe(`${'あ'.repeat(SPEECH_BUBBLE_MAX_LETTERS)}…`);
      expect(speechTextOf('一\n二\n三\n四\n五')).toBe('一\n二\n三\n四…');
      expect(speechTextOf('一\n\n二')).toBe('一\n二');
      expect(speechTextOf('👨‍👩‍👧'.repeat(SPEECH_BUBBLE_MAX_LETTERS))).toBe('👨‍👩‍👧'.repeat(SPEECH_BUBBLE_MAX_LETTERS));
    });

    it('shows a stamp with the words said with it, and nothing for a line of no words', () => {
      const stamped = line({ stamp: 'seal:ok' }, joinStampLine('「よし」', '[OK]'));
      expect(speechBubbleContentOf(stamped)).toEqual({ text: 'よし', stamp: 'seal:ok' });
      expect(speechBubbleContentOf(line({ stamp: 'seal:ok' }, '[OK]'))).toEqual({ text: '', stamp: 'seal:ok' });
      expect(speechBubbleContentOf(line({}, '   '))).toBeNull();
    });

    it('stays longer for more words, within bounds, and a little longer for a stamp alone', () => {
      expect(speechBubbleDurationMs({ text: 'あ', stamp: null })).toBe(3090);
      expect(speechBubbleDurationMs({ text: 'あ'.repeat(80), stamp: null })).toBe(9000);
      expect(speechBubbleDurationMs({ text: '', stamp: 'seal:ok' })).toBe(4000);
    });
  });

  describe('which lines get one', () => {
    it('gives one to a line said to everyone in the open', () => {
      expect(isSpeechLine(line())).toBe(true);
    });

    it('gives none to a whisper, a secret, a notice, a deleted line or one outside the story', () => {
      expect(isSpeechLine(line({ to: 'you' }))).toBe(false);
      expect(isSpeechLine(line({ tag: 'secret' }))).toBe(false);
      expect(isSpeechLine(line({ tag: 'system', from: 'System-BCDice' }))).toBe(false);
      expect(isSpeechLine(line({ from: 'System' }))).toBe(false);
      expect(isSpeechLine(line({ pseudoDeletedAt: 5 }))).toBe(false);
      expect(isSpeechLine(line({ tag: OUT_OF_STORY_TAG }))).toBe(false);
    });

    it('gives none to a line whispered after the fact', () => {
      const message = line();
      message.makeAfterWhisper('you', 'あなた', 10);
      expect(isSpeechLine(message)).toBe(false);
    });

    it('tells the line the tool answered as a roll or a resource change from the answer', () => {
      const tab = new ChatTab();
      tab.initialize();
      try {
        const said = tab.addMessage({ from: 'me', name: 'ヒロ', text: '2d6', timestamp: 1000 });
        const roll = tab.addMessage({
          from: 'System-BCDice',
          originFrom: 'me',
          tag: 'system',
          name: '<BCDice：ヒロ>',
          text: '2D6 → 7',
          timestamp: 1001,
        });
        const change = tab.addMessage({
          from: 'System',
          originFrom: 'me',
          tag: 'system',
          name: 'ヒロ',
          text: 'HP 10 → 7',
          timestamp: 1002,
        });
        const key = speechLineKey(tab.identifier, said.from, said.timestamp);

        expect(answeredLineKeys(roll)).toContain(key);
        expect(answeredLineKeys(change)).toContain(key);
        expect(answeredLineKeys(said)).toEqual([]);
      } finally {
        tab.destroy();
      }
    });
  });
});
