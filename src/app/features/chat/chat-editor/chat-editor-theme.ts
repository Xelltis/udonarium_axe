import { CHAT_COLORS } from '@axe/domain/chat/chat-decoration';
import { EditorView } from '@codemirror/view';

/**
 * How the editor looks: the plain box's border, background and type, the colour of each syntax,
 * faded marks and the chip a reference's value is shown in. The colours are the chat's own
 * mid-toned ones, which read on a light screen and a dark one. It is written into the page only
 * once the editor is fetched, so none of it weighs on the page as it starts.
 */
export const chatEditorTheme = EditorView.theme({
  '&': {
    flex: '1 1 auto',
    minHeight: '0',
    border: '1px solid var(--ui-input-border)',
    borderRadius: 'var(--ui-radius-sm)',
    backgroundColor: 'var(--ui-input-bg)',
    color: 'var(--ui-text)',
    fontSize: '13px',
    lineHeight: '1.4',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  },
  '&.cm-focused': {
    outline: 'none',
    borderColor: 'var(--ui-accent)',
    boxShadow: '0 0 0 2px var(--ui-accent-glow)',
  },
  '.cm-scroller': { overflow: 'auto', fontFamily: 'inherit', lineHeight: 'inherit' },
  '.cm-content': { padding: '6px 8px', caretColor: 'var(--ui-text)' },
  '.cm-line': { padding: '0' },
  '.cm-placeholder': { color: 'var(--ui-text-dim)' },
  '.cm-content .chat-size-huge': { fontSize: '1.4em' },
  '.cm-content .chat-deco-italic': { display: 'inline', transform: 'none', fontStyle: 'italic' },
  '.cm-chat-marker': { opacity: '0.5' },
  '.cm-chat-roll': { color: CHAT_COLORS.blue, fontWeight: '600' },
  '.cm-chat-reference': { color: CHAT_COLORS.cyan },
  '.cm-chat-resource': { color: CHAT_COLORS.orange },
  '.cm-chat-buff': { color: CHAT_COLORS.purple },
  '.cm-chat-portrait': { color: CHAT_COLORS.green },
  '.cm-chat-cut-in': { color: CHAT_COLORS.pink, textDecoration: 'underline dotted' },
  '.cm-chat-effect': { color: CHAT_COLORS.pink },
  '.cm-chat-dice-token': { color: CHAT_COLORS.blue },
  '.cm-chat-quote, .cm-chat-staging, .cm-chat-variable': { color: CHAT_COLORS.gray },
  '.cm-chat-tab': { color: CHAT_COLORS.purple, fontWeight: '700' },
  '.cm-chat-chip::after': {
    content: 'attr(data-value)',
    marginLeft: '2px',
    padding: '0 4px',
    borderRadius: '6px',
    fontSize: '0.8em',
    color: 'var(--ui-text-muted)',
    backgroundColor: 'var(--ui-hover)',
  },
  '.cm-tooltip': {
    fontSize: '12px',
    maxWidth: '22rem',
    color: 'var(--ui-text)',
    backgroundColor: 'var(--ui-input-bg)',
    border: '1px solid var(--ui-input-border)',
    borderRadius: 'var(--ui-radius-sm)',
  },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': { color: '#fff', backgroundColor: 'var(--ui-accent)' },
});
