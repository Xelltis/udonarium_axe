import { ChatTab } from '@axe/domain/chat/chat-tab';
import { gameMasterUserIds, tellGameMasters } from '@axe/domain/chat/game-master-lines';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('telling the game masters alone', () => {
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

  it('addresses the line to them, answering nobody, so the seat that put it out does not read it', () => {
    seat('u-gm', PeerRole.GameMaster);

    tellGameMasters(tab, line, 'HP:10-5＞5');

    const [told] = tab.chatMessages;
    expect(told.text).toBe('HP:10-5＞5');
    expect(told.sendTo).toEqual(['u-gm']);
    expect(told.isDisplayableTo('u-gm')).toBe(true);
    expect(told.isDisplayableTo('u-pl')).toBe(false);
  });

  it('says nothing where no game master is seated', () => {
    seat('u-pl', PeerRole.Player);

    tellGameMasters(tab, line, 'HP:10-5＞5');

    expect(tab.chatMessages).toHaveLength(0);
  });
});
