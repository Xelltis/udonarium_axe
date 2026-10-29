import { InjectionToken } from '@angular/core';
import type * as ChatEditor from '@axe/features/chat/chat-editor/chat-editor';

/** The editor's code, which is fetched apart from the code the page starts with. */
export type ChatEditorModule = typeof ChatEditor;

/**
 * How long a text may be for its syntax to be coloured and checked: past it, the editor draws it
 * plain, and nothing reads it over at every key.
 */
export const CHAT_HIGHLIGHT_LIMIT = 8000;

/** Fetches the editor's code, answering null when it cannot be fetched. */
export type ChatEditorLoader = () => Promise<ChatEditorModule | null>;

let loading: Promise<ChatEditorModule | null> | null = null;

/**
 * Fetches the editor, once, and answers with it; null when it cannot be fetched, as when a release
 * has replaced the page's code, and lines are then typed into the plain box for the rest of the
 * visit.
 */
export function loadChatEditor(): Promise<ChatEditorModule | null> {
  loading ??= import('@axe/features/chat/chat-editor/chat-editor').then(
    (module) => module,
    () => null
  );
  return loading;
}

/** How the chat input fetches the editor; a test hands in one that never arrives. */
export const CHAT_EDITOR_LOADER = new InjectionToken<ChatEditorLoader>('CHAT_EDITOR_LOADER', {
  providedIn: 'root',
  factory: () => loadChatEditor,
});
