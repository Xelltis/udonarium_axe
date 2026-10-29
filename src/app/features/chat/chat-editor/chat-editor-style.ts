import { CHAT_COLORS } from '@axe/domain/chat/chat-decoration';

const STYLE_ID = 'chat-rich-editor-style';

/**
 * How the editor draws what is written in it: chips on a ground of their own, each kind of syntax
 * with a light tint behind it, its words left in the colour the line is written in, wavy lines
 * under what will not work, and the hint that opens over them. It is written into a page only once the
 * editor is fetched, so none of it weighs on the page as it starts.
 */
const CHAT_EDITOR_CSS = `
.chat-rich{flex:1 1 auto;outline:none;box-sizing:border-box;min-height:100%;padding:6px 8px;font-size:13px;line-height:1.45;color:inherit;caret-color:currentColor;white-space:pre-wrap;overflow-wrap:anywhere}
.chat-rich p{margin:0}
.chat-rich p.is-editor-empty:first-child::before{content:attr(data-placeholder);color:color-mix(in srgb,currentColor 50%,transparent);float:left;height:0;pointer-events:none}
.chat-rich .chat-rich-italic{font-style:oblique 12deg}
.chat-rich .chat-size-huge{font-size:1.4em}
.chat-rich .chat-chip{display:inline-flex;align-items:center;gap:2px;margin:0 1px;padding:0 6px;border:1px solid var(--chip-accent,var(--ui-border-panel));border-radius:999px;background:var(--ui-elevated);color:var(--ui-text);font-size:.92em;font-weight:normal;font-style:normal;line-height:1.4;white-space:nowrap;vertical-align:baseline;cursor:default}
.chat-rich .chat-chip-icon{font-size:14px!important;line-height:1;color:var(--chip-accent,inherit)}
.chat-rich .chat-chip-badge{font-size:.7em;font-weight:700;opacity:.75}
.chat-rich .chat-chip-reference{--chip-accent:${CHAT_COLORS.cyan};box-shadow:inset 3px 0 0 var(--chip-accent)}
.chat-rich .chat-chip-reference[data-value]::after{content:attr(data-value);margin-left:3px;padding:0 4px;border-radius:6px;background:var(--ui-hover);color:var(--ui-text-muted);font-size:.85em}
.chat-rich .chat-chip-effect,.chat-rich .chat-chip-cut-in{--chip-accent:${CHAT_COLORS.pink}}
.chat-rich .chat-chip-portrait{--chip-accent:${CHAT_COLORS.green}}
.chat-rich .chat-chip-thumb{display:none;width:16px;height:16px;margin-left:-3px;border-radius:50%;background:var(--chip-image) center/cover no-repeat}
.chat-rich .chat-chip-portrait[style*="--chip-image"] .chat-chip-thumb{display:inline-block}
.chat-rich .chat-chip-portrait[style*="--chip-image"] .chat-chip-icon{display:none}
.chat-rich .chat-chip-idle{opacity:.5;border-style:dashed}
.chat-rich .chat-chip-stamp{display:inline-flex;vertical-align:middle;margin:0 1px;border-radius:4px}
.chat-rich .ProseMirror-selectednode{outline:2px solid var(--ui-accent);outline-offset:1px}
.chat-rich ruby.chat-chip-ruby{padding:0 1px;border-radius:3px;background:color-mix(in srgb,currentColor 8%,transparent)}
.chat-rich :is(.chat-rich-roll,.chat-rich-resource,.chat-rich-buff,.chat-rich-reference,.chat-rich-effect,.chat-rich-cut-in,.chat-rich-portrait,.chat-rich-dice-token,.chat-rich-tab){border-radius:3px;background:color-mix(in srgb,var(--syntax-tint) 24%,transparent);box-decoration-break:clone;-webkit-box-decoration-break:clone}
.chat-rich .chat-rich-roll{--syntax-tint:${CHAT_COLORS.blue};font-weight:600}
.chat-rich .chat-rich-resource{--syntax-tint:${CHAT_COLORS.orange}}
.chat-rich .chat-rich-buff{--syntax-tint:${CHAT_COLORS.purple}}
.chat-rich .chat-rich-reference{--syntax-tint:${CHAT_COLORS.cyan}}
.chat-rich .chat-rich-effect,.chat-rich .chat-rich-cut-in{--syntax-tint:${CHAT_COLORS.pink}}
.chat-rich .chat-rich-portrait{--syntax-tint:${CHAT_COLORS.green}}
.chat-rich .chat-rich-dice-token{--syntax-tint:${CHAT_COLORS.blue}}
.chat-rich .chat-rich-quiet{opacity:.6}
.chat-rich .chat-rich-tab{--syntax-tint:${CHAT_COLORS.purple};font-weight:700}
.chat-rich .chat-lint-error{text-decoration:underline wavy var(--ui-danger) 1px;text-underline-offset:3px;text-decoration-skip-ink:none}
.chat-rich .chat-lint-warning{text-decoration:underline wavy var(--ui-warning) 1px;text-underline-offset:3px;text-decoration-skip-ink:none}
.chat-rich .chat-lint-info{text-decoration:underline dotted var(--ui-accent) 1px;text-underline-offset:3px}
.chat-rich .chat-chip.chat-lint-error{border-color:var(--ui-danger);text-decoration:none}
.chat-rich .chat-chip.chat-lint-warning{border-color:var(--ui-warning);text-decoration:none}
.chat-rich-tip{position:fixed;z-index:10000;display:flex;align-items:flex-start;gap:6px;max-width:20rem;box-sizing:border-box;padding:6px 10px;border:1px solid var(--ui-menu-border);border-radius:var(--ui-radius-lg);background:var(--ui-menu-bg);color:var(--ui-text);font-size:12px;line-height:1.45;box-shadow:var(--ui-shadow-lg);pointer-events:none}
.chat-rich-tip[hidden]{display:none}
.chat-rich-tip .material-icons{flex:none;margin-top:1px;font-size:15px;line-height:1;color:var(--ui-text-muted)}
.chat-rich-tip[data-severity="error"] .material-icons{color:var(--ui-danger)}
.chat-rich-tip[data-severity="warning"] .material-icons{color:var(--ui-warning)}
.chat-rich-tip[data-severity="info"] .material-icons{color:var(--ui-accent)}
.chat-rich-bubble{z-index:10000;display:flex;flex-wrap:wrap;align-items:center;gap:1px;max-width:15rem;padding:2px;border:1px solid var(--ui-input-border);border-radius:var(--ui-radius-sm);background:var(--ui-input-bg);color:var(--ui-text);box-shadow:0 2px 10px rgb(0 0 0 / .3)}
.chat-rich-bubble>button{display:flex;align-items:center;justify-content:center;min-width:26px;height:26px;margin:0;padding:0 4px;border:none;border-radius:var(--ui-radius-sm);background:transparent;color:var(--ui-text-muted);font-size:11px;font-weight:600;cursor:pointer}
.chat-rich-bubble>button:hover,.chat-rich-bubble>button[aria-pressed="true"]{background:var(--ui-hover);color:var(--ui-text)}
.chat-rich-bubble .material-icons{font-size:17px}
.chat-rich-bubble-swatches{display:flex;flex-wrap:wrap;gap:3px;width:100%;padding:3px}
.chat-rich-bubble-swatches[hidden]{display:none}
.chat-rich-bubble-swatch{width:18px;height:18px;margin:0;padding:0;border:1px solid var(--ui-input-border);border-radius:50%;cursor:pointer}
.chat-rich-bubble-clear{background:linear-gradient(135deg,transparent 45%,${CHAT_COLORS.red} 45% 55%,transparent 55%)}
.chat-rich-menu{position:fixed;z-index:10000;display:flex;flex-direction:column;min-width:10rem;max-width:20rem;max-height:14rem;overflow-y:auto;box-sizing:border-box;padding:3px;border:1px solid var(--ui-input-border);border-radius:var(--ui-radius-sm);background:var(--ui-input-bg);color:var(--ui-text);font-size:12px;box-shadow:0 2px 10px rgb(0 0 0 / .3)}
.chat-rich-menu button{display:flex;gap:6px;align-items:center;margin:0;padding:3px 6px;border:none;border-radius:var(--ui-radius-sm);background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.chat-rich-menu button[aria-selected="true"],.chat-rich-menu button:hover{background:var(--ui-hover)}
.chat-rich-menu .chat-rich-menu-hint{margin-left:auto;color:var(--ui-text-dim);font-size:.9em}
`;

/** Writes the editor's look into the page it stands in, once. */
export function ensureChatEditorStyle(document: Document): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CHAT_EDITOR_CSS;
  document.head.append(style);
}
