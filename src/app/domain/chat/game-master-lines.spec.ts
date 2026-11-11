import { ChatTab } from '@axe/domain/chat/chat-tab';
import { gameMasterUserIds, tellThoseWhoMaySee } from '@axe/domain/chat/game-master-lines';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('telling those who may see what a piece keeps back', () => {
  let tab: ChatTab;
  const seated: PeerCursor[] = [];

  function seat(userId: string, role: PeerRole): PeerCursor {
    const cursor = new PeerCursor();
    cursor.initialize();
    cursor.userId = userId;
    cursor.role = role;
    seated.push(cursor);
    return cursor;
  }

  const line = {
    identifier: '',
    tabIdentifier: '',
    from: 'System',
    originFrom: 'u-pl',
    timestamp: 5,
    imageIdentifier: '',
    tag: 'system',
    name: 'プレイヤー',
    text: 'HP:-5',
  };

  beforeEach(() => {
    tab = new ChatTab();
    tab.initialize();
  });

  afterEach(() => {
    for (const cursor of seated.splice(0)) cursor.destroy();
    tab.destroy();
  });

  it('names each seat of a game master once', () => {
    seat('u-gm', PeerRole.GameMaster);
    seat('u-gm', PeerRole.GameMaster);
    seat('u-gm2', PeerRole.GameMaster);
    seat('u-pl', PeerRole.Player);

    expect(gameMasterUserIds().sort()).toEqual(['u-gm', 'u-gm2']);
  });

  const keptFromAll = { disclosureMode: 'gm', disclosureUserIds: [] as string[], owner: '' };

  it('addresses the line to the game masters, answering nobody, so the seat that put it out does not read it', () => {
    seat('u-gm', PeerRole.GameMaster);
    seat('u-pl', PeerRole.Player);

    tellThoseWhoMaySee(tab, line, 'HP:10-5＞5', [keptFromAll]);

    const [told] = tab.chatMessages;
    expect(told.text).toBe('HP:10-5＞5');
    expect(told.sendTo).toEqual(['u-gm']);
    expect(told.isDisplayableTo('u-gm')).toBe(true);
    expect(told.isDisplayableTo('u-pl')).toBe(false);
  });

  it('tells the owner of a piece and those it is disclosed to as well, with no game master seated', () => {
    seat('u-owner', PeerRole.Player);
    seat('u-picked', PeerRole.Player);
    seat('u-other', PeerRole.Player);
    const piece = { disclosureMode: 'selected', disclosureUserIds: ['u-picked'], owner: 'u-owner' };

    tellThoseWhoMaySee(tab, line, 'HP:10-5＞5', [piece]);

    expect(tab.chatMessages[0].sendTo.sort()).toEqual(['u-owner', 'u-picked']);
  });

  it('tells only those who may see every piece the line names', () => {
    seat('u-gm', PeerRole.GameMaster);
    seat('u-owner', PeerRole.Player);
    const owned = { ...keptFromAll, owner: 'u-owner' };

    tellThoseWhoMaySee(tab, line, 'HP:10-5＞5', [owned, keptFromAll]);

    expect(tab.chatMessages[0].sendTo).toEqual(['u-gm']);
  });

  it('says nothing where nobody seated may see the piece', () => {
    seat('u-pl', PeerRole.Player);

    tellThoseWhoMaySee(tab, line, 'HP:10-5＞5', [keptFromAll]);

    expect(tab.chatMessages).toHaveLength(0);
  });
});
