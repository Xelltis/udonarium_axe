import { TestBed } from '@angular/core/testing';
import { ChatPaletteWriteService } from '@axe/application/chat/chat-palette-write.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { BuffPalette } from '@axe/domain/chat/chat-palette';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('ChatPaletteWriteService', () => {
  let service: ChatPaletteWriteService;
  let palette: BuffPalette;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    service = TestBed.inject(ChatPaletteWriteService);
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.role = PeerRole.Player;
    palette = new BuffPalette();
    palette.initialize();
    palette.setPalette('マッスルベアー DB+2 3');
  });

  afterEach(() => {
    ObjectStore.instance.remove(palette);
    PeerCursor.myCursor = null!;
  });

  it('rewrites a palette and the dice system it rolls under for a seat that may edit the table', () => {
    expect(service.writeLines(palette, 'クリティカルレイ A 18')).toBe(true);
    expect(service.setDiceBot(palette, 'SwordWorld2.5')).toBe(true);
    expect(service.setDiceBot(palette, 'SwordWorld2.5')).toBe(false);

    expect([palette.getPalette(), palette.dicebot]).toEqual([['クリティカルレイ A 18'], 'SwordWorld2.5']);
  });

  it('rewrites nothing for a guest', () => {
    PeerCursor.myCursor.role = PeerRole.Guest;

    expect(service.writeLines(palette, '書き換え')).toBe(false);
    expect(service.setDiceBot(palette, 'SwordWorld2.5')).toBe(false);

    expect([palette.getPalette(), palette.dicebot]).toEqual([['マッスルベアー DB+2 3'], 'DiceBot']);
  });
});
