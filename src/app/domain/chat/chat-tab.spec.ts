import { TestBed } from '@angular/core/testing';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { ChatTab } from '@axe/domain/chat/chat-tab';

describe('ChatTab', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  describe('the defaults of the synchronised fields', () => {
    it('starts with the default name', () => {
      const tab = new ChatTab();
      tab.initialize();
      expect(tab.name).toBe('タブ');
    });

    it('starts unpositioned', () => {
      const tab = new ChatTab();
      tab.initialize();
      expect(tab.pos_num).toBe(-1);
    });

    it('starts at no messages', () => {
      const tab = new ChatTab();
      tab.initialize();
      expect(tab.count).toBe(0);
    });

    it('holds a picture for each of the twelve places', () => {
      const tab = new ChatTab();
      tab.initialize();
      expect(tab.imageIdentifier).toHaveLength(12);
    });

    it('holds a name for each of them', () => {
      const tab = new ChatTab();
      tab.initialize();
      expect(tab.imageCharacterName).toHaveLength(12);
    });
  });

  describe('chatMessages', () => {
    it('starts empty', () => {
      const tab = new ChatTab();
      tab.initialize();
      expect(tab.chatMessages).toEqual([]);
    });
  });

  describe('findRollSource()', () => {
    function tabWithChatter(count: number): ChatTab {
      const tab = new ChatTab();
      tab.initialize();
      for (let i = 0; i < count; i++) {
        tab.addMessage({ from: `user-${i % 3}`, name: `話者${i % 3}`, text: `発言${i}`, timestamp: 1000 + i * 10 });
      }
      return tab;
    }

    it('finds the line a roll answers among a long log', () => {
      const tab = tabWithChatter(500);
      try {
        const said = tab.addMessage({ from: 'roller', name: 'アリス', text: '2d6', timestamp: 3005 });
        tab.addMessage({ from: 'user-1', name: '話者1', text: '割り込み', timestamp: 3005 });
        const rolled = tab.addMessage({
          from: 'System-BCDice',
          originFrom: 'roller',
          name: '<BCDice：アリス>',
          text: '(2D6) → 7',
          timestamp: 3006,
        });

        expect(tab.findRollSource(rolled)).toBe(said);
      } finally {
        tab.destroy();
      }
    });

    it('finds the line a secret roll answers once that line is disclosed after the result', () => {
      const disclose = (tab: ChatTab, message: ChatMessage, at: number) => {
        message.tag = message.tags.filter((tag) => tag !== 'secret').join(' ');
        message.disclosedAt = at;
        tab.appendChild(message);
      };
      const tab = tabWithChatter(50);
      try {
        const said = tab.addMessage({
          from: 'roller',
          name: 'アリス',
          text: 'S2d6',
          tag: 'DiceBot secret',
          timestamp: 3005,
        });
        const rolled = tab.addMessage({
          from: 'System-BCDice',
          originFrom: 'roller',
          name: '<Secret-BCDice：アリス>',
          text: '(2D6) → 7',
          tag: 'system secret',
          timestamp: 3006,
        });
        tab.addMessage({ from: 'user-1', name: '話者1', text: 'その後', timestamp: 3010 });

        disclose(tab, rolled, 4000);
        disclose(tab, said, 4001);

        expect(said.index).toBeGreaterThan(rolled.index);
        expect(tab.findRollSource(rolled)).toBe(said);
      } finally {
        tab.destroy();
      }
    });

    it('reads the log once however many results look for a line it does not hold', () => {
      const tab = tabWithChatter(300);
      const results = Array.from({ length: 40 }, (_, i) =>
        tab.addMessage({
          from: 'System-BCDice',
          originFrom: 'roller',
          name: '<BCDice：アリス>',
          text: `(1D6) → ${i}`,
          timestamp: 1001 + i * 10,
        })
      );
      const readings = vi.spyOn(ChatMessage.prototype, 'timestamp', 'get');
      try {
        for (let pass = 0; pass < 2; pass++) {
          for (const rolled of results) expect(tab.findRollSource(rolled)).toBeNull();
        }

        expect(readings.mock.calls.length).toBeLessThan(2 * tab.chatMessages.length);
      } finally {
        readings.mockRestore();
        tab.destroy();
      }
    });

    it('finds a line that arrives after it was first looked for, and not one that has left the tab', () => {
      const tab = tabWithChatter(20);
      try {
        const rolled = tab.addMessage({
          from: 'System-BCDice',
          originFrom: 'roller',
          name: '<BCDice：アリス>',
          text: '(2D6) → 7',
          timestamp: 3006,
        });
        expect(tab.findRollSource(rolled)).toBeNull();

        const said = tab.addMessage({ from: 'roller', name: 'アリス', text: '2d6', timestamp: 3005 });
        expect(tab.findRollSource(rolled)).toBe(said);

        tab.removeChild(said);
        expect(tab.findRollSource(rolled)).toBeNull();
      } finally {
        tab.destroy();
      }
    });

    it('finds nothing said at that moment by somebody else', () => {
      const tab = tabWithChatter(20);
      try {
        tab.addMessage({ from: 'bystander', name: 'ボブ', text: '2d6', timestamp: 3005 });
        const rolled = tab.addMessage({
          from: 'System-BCDice',
          originFrom: 'roller',
          name: '<BCDice：アリス>',
          text: '(2D6) → 7',
          timestamp: 3006,
        });

        expect(tab.findRollSource(rolled)).toBeNull();
      } finally {
        tab.destroy();
      }
    });
  });

  describe('portraitReset()', () => {
    it('clears the portraits', () => {
      const tab = new ChatTab();
      tab.initialize();
      tab.imageIdentifier = ['x', 'y'];
      tab.portraitReset();
      expect(tab.imageIdentifier).toHaveLength(12);
      expect(tab.imageIdentifier[0]).toBe('a');
    });
  });

  describe('portraitSlotOf()', () => {
    it('returns which place a name is in', () => {
      const tab = new ChatTab();
      tab.initialize();
      expect(tab.portraitSlotOf('#0')).toBe(0);
      expect(tab.portraitSlotOf('#5')).toBe(5);
    });

    it('returns nothing for a name it does not have', () => {
      const tab = new ChatTab();
      tab.initialize();
      expect(tab.portraitSlotOf('unknown')).toBe(-1);
    });
  });

  describe('isPortraitPosVisible()', () => {
    it('starts with every place shown', () => {
      const tab = new ChatTab();
      tab.initialize();
      expect(tab.isPortraitPosVisible(0)).toBe(true);
      expect(tab.isPortraitPosVisible(11)).toBe(true);
    });
  });

  describe('hidePortraitPos()', () => {
    it('hides one', () => {
      const tab = new ChatTab();
      tab.initialize();
      tab.hidePortraitPos(3);
      expect(tab.isPortraitPosVisible(3)).toBe(false);
    });
  });

  describe('portraitZIndex()', () => {
    it('returns where a place sits in the stack', () => {
      const tab = new ChatTab();
      tab.initialize();
      expect(tab.portraitZIndex(0)).toBe(0);
      expect(tab.portraitZIndex(5)).toBe(5);
    });
  });

  describe('replacePortraitZIndex()', () => {
    it('brings one to the top of it', () => {
      const tab = new ChatTab();
      tab.initialize();
      tab.replacePortraitZIndex(3);
      const zpos = tab.imageZposList;
      expect(zpos[zpos.length - 1]).toBe(3);
    });
  });

  describe('unread', () => {
    it('starts with nothing unread', () => {
      const tab = new ChatTab();
      tab.initialize();
      expect(tab.unreadLength).toBe(0);
      expect(tab.hasUnread).toBe(false);
    });

    it('clears the unread count on being read', () => {
      const tab = new ChatTab();
      tab.initialize();
      tab.markForRead();
      expect(tab.unreadLength).toBe(0);
    });

    it('counts a new message as unread', () => {
      const tab = new ChatTab();
      tab.initialize();
      tab.addMessage({ text: 'hello', name: 'user1' });
      expect(tab.unreadLength).toBeGreaterThan(0);
      expect(tab.hasUnread).toBe(true);
    });

    it('keeps the colour of a message', () => {
      const tab = new ChatTab();
      tab.initialize();
      const msg = tab.addMessage({ text: 'hello', name: 'user1', messColor: '#0099FF' });
      expect(msg.messColor).toBe('#0099FF');
    });

    it('keeps its name', () => {
      const tab = new ChatTab();
      tab.initialize();
      const msg = tab.addMessage({ text: 'hello', name: 'テストプレイヤー' });
      expect(msg.name).toBe('テストプレイヤー');
    });

    it('keeps its sender', () => {
      const tab = new ChatTab();
      tab.initialize();
      const msg = tab.addMessage({ text: 'hello', name: 'user', from: 'user-id-123' });
      expect(msg.from).toBe('user-id-123');
    });

    it('counts several unread messages up', () => {
      const tab = new ChatTab();
      tab.initialize();
      tab.addMessage({ text: 'msg1', name: 'user1' });
      tab.addMessage({ text: 'msg2', name: 'user1' });
      tab.addMessage({ text: 'msg3', name: 'user1' });
      expect(tab.unreadLength).toBe(3);
    });

    it('clears that count once they are read', () => {
      const tab = new ChatTab();
      tab.initialize();
      tab.addMessage({ text: 'hello', name: 'user1' });
      tab.markForRead();
      expect(tab.unreadLength).toBe(0);
      expect(tab.hasUnread).toBe(false);
    });
  });

  describe('dispCharctorIcon', () => {
    it('starts true', () => {
      const tab = new ChatTab();
      tab.initialize();
      expect(tab.dispCharctorIcon).toBe(true);
    });

    it('takes a false', () => {
      const tab = new ChatTab();
      tab.initialize();
      tab.dispCharctorIcon = false;
      expect(tab.dispCharctorIcon).toBe(false);
    });
  });

  describe('latestTimeStamp', () => {
    it('returns nothing when there are no messages', () => {
      const tab = new ChatTab();
      tab.initialize();
      expect(tab.latestTimeStamp).toBe(0);
    });
  });

  describe('escapeHtml()', () => {
    it('escapes the markup', () => {
      const tab = new ChatTab();
      tab.initialize();
      expect(tab.escapeHtml('<script>')).toBe('&lt;script&gt;');
    });

    it('escapes an ampersand', () => {
      const tab = new ChatTab();
      tab.initialize();
      expect(tab.escapeHtml('a&b')).toBe('a&amp;b');
    });

    it('escapes a quote', () => {
      const tab = new ChatTab();
      tab.initialize();
      expect(tab.escapeHtml('"test"')).toBe('&quot;test&quot;');
    });

    it('reads the ruby notation', () => {
      const tab = new ChatTab();
      tab.initialize();
      const result = tab.escapeHtml('|漢字《かんじ》');
      expect(result).toContain('<ruby>');
      expect(result).toContain('<rt>かんじ</rt>');
    });

    it('renders anything that is not text as text', () => {
      const tab = new ChatTab();
      tab.initialize();
      expect(tab.escapeHtml(123)).toBe('123');
    });
  });

  describe('displayableMessagesLength()', () => {
    it('starts at nothing', () => {
      const tab = new ChatTab();
      tab.initialize();
      expect(tab.displayableMessagesLength()).toBe(0);
    });
  });
});
