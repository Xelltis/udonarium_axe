import { Logger } from '@axe/core/logging/logger';

/**
 * The file to write into.
 *
 * Buffering all of it in memory makes the video length the limit. Opening the destination
 * first and streaming into it leaves only free space to decide the length.
 */

interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: { description?: string; accept: Record<string, string[]> }[];
}

type SaveFilePicker = (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;

function picker(): SaveFilePicker | null {
  const candidate = (globalThis as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
  return typeof candidate === 'function' ? candidate : null;
}

/** Whether this browser can ask for a save location, so an export streams straight to disk. */
export function isVideoFileSinkSupported(): boolean {
  return picker() != null;
}

/**
 * Asks where to save. **Call it from the click** — a browser only opens the dialogue
 * straight after a gesture. Refused, it returns null and the caller exports through memory.
 */
export async function askVideoFile(fileName: string): Promise<FileSystemFileHandle | null> {
  const open = picker();
  if (!open) return null;

  try {
    return await open({
      suggestedName: fileName,
      types: [{ description: 'MP4', accept: { 'video/mp4': ['.mp4'] } }],
    });
  } catch (reason) {
    // Cancelling is not a failure.
    if (reason instanceof DOMException && reason.name === 'AbortError') return null;
    Logger.warn('[VideoFileSink] 保存先を開けませんでした', reason);
    return null;
  }
}
