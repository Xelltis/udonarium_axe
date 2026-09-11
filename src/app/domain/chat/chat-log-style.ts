export const CHAT_LOG_STYLES = ['standard', 'parchment', 'washi', 'eerie', 'neon', 'messenger', 'coc'] as const;

export type ChatLogStyle = (typeof CHAT_LOG_STYLES)[number];

export type RichChatLogStyle = Exclude<ChatLogStyle, 'standard' | 'coc'>;

export const DEFAULT_CHAT_LOG_STYLE: ChatLogStyle = 'standard';

export interface ChatLogStyleSwatch {
  readonly ground: string;
  readonly surface: string;
  readonly accent: string;
}

export const CHAT_LOG_STYLE_SWATCHES: Readonly<Record<ChatLogStyle, ChatLogStyleSwatch>> = {
  standard: { ground: '#ffffff', surface: '#f7f7f7', accent: '#888888' },
  parchment: { ground: '#2b1d12', surface: '#f2e4c4', accent: '#8a3b1f' },
  washi: { ground: '#e8e0cf', surface: '#fbf8f0', accent: '#b52b2e' },
  eerie: { ground: '#0a0b0b', surface: '#151918', accent: '#9a2a2a' },
  neon: { ground: '#05070f', surface: '#0c1830', accent: '#2bd4ff' },
  messenger: { ground: '#dfe5ec', surface: '#ffffff', accent: '#2f6fed' },
  coc: { ground: '#ffffff', surface: '#f7f7f7', accent: '#555555' },
};

export function isChatLogStyle(value: unknown): value is ChatLogStyle {
  return typeof value === 'string' && (CHAT_LOG_STYLES as readonly string[]).includes(value);
}

export function isRichChatLogStyle(style: ChatLogStyle): style is RichChatLogStyle {
  return style !== 'standard' && style !== 'coc';
}
