const KILO_BYTE = 1024;

/** Writes when a snapshot was saved as year/month/day hour:minute, in the reader's local time. */
export function formatSnapshotSavedAt(savedAt: number): string {
  const date = new Date(savedAt);
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Writes a snapshot's size in B, KB or MB, with one decimal place above bytes. */
export function formatSnapshotByteSize(byteSize: number): string {
  if (byteSize < KILO_BYTE) return `${byteSize} B`;

  const kiloBytes = byteSize / KILO_BYTE;
  if (kiloBytes < KILO_BYTE) return `${kiloBytes.toFixed(1)} KB`;

  return `${(kiloBytes / KILO_BYTE).toFixed(1)} MB`;
}
