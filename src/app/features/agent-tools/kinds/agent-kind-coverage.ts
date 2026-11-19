/**
 * How the AI link reaches a kind of synced thing: as a kind of the generic tools, through tools of its
 * own, or not at all, with why.
 */
export type AgentKindCoverage =
  | { readonly by: 'kind' }
  | { readonly by: 'tools'; readonly tools: readonly string[] }
  | { readonly by: 'none'; readonly why: string };

const KIND: AgentKindCoverage = { by: 'kind' };

const SAVE_HOLDER: AgentKindCoverage = {
  by: 'none',
  why: 'A holder for saving and loading the room, which leaves the store as it arrives; what it holds is a kind of its own.',
};

/**
 * Every kind of synced thing and how the AI link reaches it, so that none is left out unawares: a spec
 * reads every `@SyncObject` of the sources and fails on one missing here, on a kind said to be offered
 * that is not, and on tools named that do not exist.
 */
export const AGENT_KIND_COVERAGE: Readonly<Record<string, AgentKindCoverage>> = {
  'text-note': KIND,
  'dice-table': KIND,
  chat: { by: 'tools', tools: ['read_chat', 'send_chat'] },
  'dice-bot': { by: 'tools', tools: ['roll_dice'] },
  TurnState: { by: 'tools', tools: ['get_turn_order', 'advance_turn'] },
  TableSelecter: { by: 'tools', tools: ['switch_table'] },
  'playlist-list': SAVE_HOLDER,
  'audio-tag-list': SAVE_HOLDER,
  'image-tag-list': SAVE_HOLDER,
  'image-tag-lock-list': SAVE_HOLDER,
  'image-link-list': SAVE_HOLDER,
  'model-tag-list': SAVE_HOLDER,
  'asset-owner-list': SAVE_HOLDER,
  'effect-preset-set': SAVE_HOLDER,
  'hotbar-set': SAVE_HOLDER,
  room: SAVE_HOLDER,
  'table-scratch-mask': {
    by: 'none',
    why: 'An older kind of mask, turned into a table-mask as soon as a seat that may edit the table reads it.',
  },
  hotbar: { by: 'none', why: "One person's bar, kept for their browser alone and not in the room's save." },
  'hotbar-slot': { by: 'none', why: "A slot of one person's bar, kept for their browser alone." },
  markdown: { by: 'none', why: 'A helper with nothing of its own to read or write.' },
  'sub-palette': {
    by: 'none',
    why: "Read only as another fork's room is loaded, and folded into the piece's chat palette at once.",
  },
  PeerCursor: { by: 'none', why: "A seat's own presence in the room, which each seat keeps for itself." },
  node: { by: 'none', why: 'The kind every synced thing is made from; nothing in a room is a bare node.' },
  TabletopObject: { by: 'none', why: 'The kind every thing on the table is made from; nothing is a bare one.' },
  'reload-check': {
    by: 'none',
    why: 'The question asked before a room is loaded over this one, answered by the person.',
  },
};
