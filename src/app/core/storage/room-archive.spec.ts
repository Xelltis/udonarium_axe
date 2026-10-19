import { ccfoliaRoomFolderOf, isCcfoliaRoomArchive } from '@axe/core/storage/room-archive';

describe('isCcfoliaRoomArchive', () => {
  it('recognises an archive carrying room data from the other tool', () => {
    expect(isCcfoliaRoomArchive(['__data.json', '.token', 'aaaa.png'])).toBe(true);
  });

  it('does not mistake its own archive for one', () => {
    expect(isCcfoliaRoomArchive(['data.xml', 'chat.xml', 'config.xml', 'summary.xml'])).toBe(false);
  });

  it('does not mistake an archive of assets for one', () => {
    expect(isCcfoliaRoomArchive(['a.png', 'b.png'])).toBe(false);
    expect(isCcfoliaRoomArchive([])).toBe(false);
  });
});

describe('ccfoliaRoomFolderOf', () => {
  it('finds the room data at the top, as saved, or in the folder it was packed again inside', () => {
    expect(ccfoliaRoomFolderOf(['__data.json', 'aaaa.png'])).toBe('');
    expect(ccfoliaRoomFolderOf(['room/__data.json', 'room/aaaa.png'])).toBe('room/');
    expect(ccfoliaRoomFolderOf(['__MACOSX/room/.___data.json', 'room/__data.json'])).toBe('room/');
  });

  it('finds none in an archive without it', () => {
    expect(ccfoliaRoomFolderOf(['room/data.xml', 'my__data.json'])).toBeNull();
  });
});
