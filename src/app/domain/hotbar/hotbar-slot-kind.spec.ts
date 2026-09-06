import {
  DEFAULT_HOTBAR_SLOT_KIND,
  HOTBAR_SLOT_KINDS,
  hotbarSlotNeedsCharacter,
  isHotbarSlotKind,
  toHotbarSlotKind,
} from '@axe/domain/hotbar/hotbar-slot-kind';

describe('hotbar slot kinds', () => {
  it('knows one of its own from anything else', () => {
    expect(isHotbarSlotKind('effect')).toBe(true);
    expect(isHotbarSlotKind('nonsense')).toBe(false);
    expect(isHotbarSlotKind(null)).toBe(false);
  });

  it('reads a kind it does not know as a chat macro, so a newer slot still does something', () => {
    expect(toHotbarSlotKind('fromTheFuture')).toBe(DEFAULT_HOTBAR_SLOT_KIND);
    expect(toHotbarSlotKind(undefined)).toBe('chat');
    expect(toHotbarSlotKind('turn')).toBe('turn');
  });

  it('says which kinds have nothing to act on without a character', () => {
    expect(hotbarSlotNeedsCharacter('chat')).toBe(true);
    expect(hotbarSlotNeedsCharacter('range')).toBe(true);
    expect(hotbarSlotNeedsCharacter('appearance')).toBe(true);
    expect(hotbarSlotNeedsCharacter('sound')).toBe(false);
    expect(hotbarSlotNeedsCharacter('cutIn')).toBe(false);
  });

  it('offers every kind exactly once', () => {
    expect(new Set(HOTBAR_SLOT_KINDS).size).toBe(HOTBAR_SLOT_KINDS.length);
  });
});
