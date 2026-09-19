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

/** What asking for a save location came to when the person closed the dialogue without choosing. */
export const VIDEO_FILE_DECLINED = 'declined';

/**
 * Asks where to save. **Call it from the click** — a browser only opens the dialogue
 * straight after a gesture. Answers `VIDEO_FILE_DECLINED` when the person closes the dialogue,
 * which calls the export off, and null when the browser cannot ask or refuses, in which case the
 * caller exports through memory.
 */
export async function askVideoFile(
  fileName: string
): Promise<FileSystemFileHandle | typeof VIDEO_FILE_DECLINED | null> {
  const open = picker();
  if (!open) return null;

  try {
    return await open({
      suggestedName: fileName,
      types: [{ description: 'MP4', accept: { 'video/mp4': ['.mp4'] } }],
    });
  } catch (reason) {
    if (reason instanceof DOMException && reason.name === 'AbortError') return VIDEO_FILE_DECLINED;
    Logger.warn('[VideoFileSink] 保存先を開けませんでした', reason);
    return null;
  }
}
