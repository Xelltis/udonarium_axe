import { formatSnapshotByteSize, formatSnapshotSavedAt } from '@axe/core/util/snapshot-format';

describe('formatSnapshotSavedAt', () => {
  it('pads the date and the time', () => {
    const savedAt = new Date(2026, 6, 3, 9, 5).getTime();
    expect(formatSnapshotSavedAt(savedAt)).toBe('2026/07/03 09:05');
  });

  it('leaves two digits as they are', () => {
    const savedAt = new Date(2026, 11, 25, 23, 59).getTime();
    expect(formatSnapshotSavedAt(savedAt)).toBe('2026/12/25 23:59');
  });
});

describe('formatSnapshotByteSize', () => {
  it('counts anything under a kilobyte in bytes', () => {
    expect(formatSnapshotByteSize(0)).toBe('0 B');
    expect(formatSnapshotByteSize(1023)).toBe('1023 B');
  });

  it('counts anything under a megabyte in kilobytes', () => {
    expect(formatSnapshotByteSize(1024)).toBe('1.0 KB');
    expect(formatSnapshotByteSize(1536)).toBe('1.5 KB');
  });

  it('counts the rest in megabytes', () => {
    expect(formatSnapshotByteSize(1024 * 1024)).toBe('1.0 MB');
    expect(formatSnapshotByteSize(1024 * 1024 * 12.5)).toBe('12.5 MB');
  });
});
