import { readdirSync, readFileSync } from 'node:fs';
import { posix } from 'node:path';

import { Network } from '@axe/core/network/network';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { heldToGameMasterByServer } from '@axe/domain/peer/server-held';

function sourcesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = posix.join(dir, entry.name);
    if (entry.isDirectory()) return sourcesUnder(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') ? [path] : [];
  });
}

describe('heldToGameMasterByServer', () => {
  const beSeat = (role: PeerRole) => {
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.role = role;
  };

  afterEach(() => {
    vi.restoreAllMocks();
    PeerCursor.myCursor = null!;
  });

  it('holds a seat other than the game master’s in a room on a server', () => {
    vi.spyOn(Network, 'authorityPeerId', 'get').mockReturnValue('server');

    beSeat(PeerRole.Player);
    expect(heldToGameMasterByServer()).toBe(true);
    beSeat(PeerRole.GameMaster);
    expect(heldToGameMasterByServer()).toBe(false);
  });

  it('holds no seat in a room of peers', () => {
    vi.spyOn(Network, 'authorityPeerId', 'get').mockReturnValue(null);

    beSeat(PeerRole.Player);
    expect(heldToGameMasterByServer()).toBe(false);
  });

  it('is the one place a seat is told so: nothing else puts the server and the game master together', () => {
    const asking = sourcesUnder('src/app').filter((file) =>
      /authorityPeerId !== null && !PeerCursor\.isMyselfGameMaster/.test(readFileSync(file, 'utf-8'))
    );

    expect(asking).toEqual(['src/app/domain/peer/server-held.ts']);
  });
});
