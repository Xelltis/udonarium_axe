export const CHAT_LOG_STYLES = [
  'standard',
  'parchment',
  'washi',
  'gothic',
  'eerie',
  'noir',
  'neon',
  'terminal',
  'cosmos',
  'military',
  'steampunk',
  'ocean',
  'messenger',
  'notebook',
  'pop',
  'coc',
] as const;

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
  gothic: { ground: '#120a0e', surface: '#24121a', accent: '#c41e3a' },
  eerie: { ground: '#0a0b0b', surface: '#151918', accent: '#9a2a2a' },
  noir: { ground: '#141414', surface: '#1f1e1b', accent: '#d9a441' },
  neon: { ground: '#05070f', surface: '#0c1830', accent: '#2bd4ff' },
  terminal: { ground: '#030a04', surface: '#062b0c', accent: '#7dff8a' },
  cosmos: { ground: '#070818', surface: '#1a1d4a', accent: '#f5c96a' },
  military: { ground: '#1e2218', surface: '#2a3021', accent: '#d9c45a' },
  steampunk: { ground: '#1b130c', surface: '#3a2816', accent: '#d49a3a' },
  ocean: { ground: '#0f2a3d', surface: '#f4ead3', accent: '#1d5f86' },
  messenger: { ground: '#dfe5ec', surface: '#ffffff', accent: '#2f6fed' },
  notebook: { ground: '#d8d0bf', surface: '#fdfcf7', accent: '#e0524f' },
  pop: { ground: '#fff4f8', surface: '#ffffff', accent: '#ff5fa2' },
  coc: { ground: '#ffffff', surface: '#f7f7f7', accent: '#555555' },
};

export function isChatLogStyle(value: unknown): value is ChatLogStyle {
  return typeof value === 'string' && (CHAT_LOG_STYLES as readonly string[]).includes(value);
}

export function isRichChatLogStyle(style: ChatLogStyle): style is RichChatLogStyle {
  return style !== 'standard' && style !== 'coc';
}
