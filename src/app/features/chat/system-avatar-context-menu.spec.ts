import { ContextMenuAction, ContextMenuType } from '@axe/application/ui/context-menu.service';
import {
  buildSystemAvatarContextMenu,
  type SystemAvatarMenuHandlers,
  type SystemAvatarMenuState,
} from '@axe/features/chat/system-avatar-context-menu';

const t = (key: string, params?: Record<string, unknown>) =>
  params && 'kind' in params ? `${key}:${params['kind']}` : key;

function state(overrides: Partial<SystemAvatarMenuState> = {}): SystemAvatarMenuState {
  return { kind: 'system', isVisible: true, isSpeakerVisible: false, hasOwnImage: false, canEdit: true, ...overrides };
}

function handlers(): SystemAvatarMenuHandlers & {
  changed: string[];
  reset: string[];
  visibility: boolean[];
  speakerVisibility: boolean[];
} {
  const changed: string[] = [];
  const reset: string[] = [];
  const visibility: boolean[] = [];
  const speakerVisibility: boolean[] = [];
  return {
    changed,
    reset,
    visibility,
    speakerVisibility,
    changeImage: (kind) => changed.push(kind),
    resetImage: (kind) => reset.push(kind),
    setVisible: (visible) => visibility.push(visible),
    setSpeakerVisible: (visible) => speakerVisibility.push(visible),
  };
}

function find(menu: ContextMenuAction[], fragment: string): ContextMenuAction | undefined {
  return menu.find((entry) => entry.name.includes(fragment));
}

describe('buildSystemAvatarContextMenu()', () => {
  it('offers nothing to someone who may not edit the room', () => {
    expect(buildSystemAvatarContextMenu(state({ canEdit: false }), handlers(), t)).toEqual([]);
  });

  it('names the picture it is opened on', () => {
    const menu = buildSystemAvatarContextMenu(state({ kind: 'dice' }), handlers(), t);

    expect(find(menu, 'changeImage')?.name).toBe(
      'feature.chat.systemAvatar.changeImage:feature.chat.systemAvatar.kindDice'
    );
  });

  it('changes the picture it is opened on', () => {
    const acted = handlers();

    find(buildSystemAvatarContextMenu(state({ kind: 'dice' }), acted, t), 'changeImage')?.action?.();

    expect(acted.changed).toEqual(['dice']);
  });

  it('keeps the reset out of reach while the default picture is in use', () => {
    const menu = buildSystemAvatarContextMenu(state({ hasOwnImage: false }), handlers(), t);

    expect(find(menu, 'resetImage')?.enabled).toBe(false);
  });

  it('puts the default picture back once one has been chosen', () => {
    const acted = handlers();

    find(buildSystemAvatarContextMenu(state({ hasOwnImage: true }), acted, t), 'resetImage')?.action?.();

    expect(acted.reset).toEqual(['system']);
  });

  it('marks the avatar as shown and offers to hide it', () => {
    const acted = handlers();
    const entry = find(buildSystemAvatarContextMenu(state({ isVisible: true }), acted, t), 'show');

    expect(entry?.name.startsWith('☑ ')).toBe(true);
    entry?.action?.();
    expect(acted.visibility).toEqual([false]);
  });

  it('marks the avatar as hidden and offers to show it', () => {
    const acted = handlers();
    const entry = find(buildSystemAvatarContextMenu(state({ isVisible: false }), acted, t), 'show');

    expect(entry?.name.startsWith('☐ ')).toBe(true);
    entry?.action?.();
    expect(acted.visibility).toEqual([true]);
  });

  it('offers the speaker in place of the mascot', () => {
    const acted = handlers();
    const entry = find(buildSystemAvatarContextMenu(state({ isSpeakerVisible: false }), acted, t), 'showSpeaker');

    expect(entry?.name.startsWith('☐ ')).toBe(true);
    entry?.action?.();
    expect(acted.speakerVisibility).toEqual([true]);
  });

  it('keeps the visibility apart from the pictures', () => {
    const menu = buildSystemAvatarContextMenu(state(), handlers(), t);

    expect(menu.some((entry) => entry.type === ContextMenuType.SEPARATOR)).toBe(true);
  });
});
