import {
  canClaimOwnership,
  canEditDisclosure,
  canViewDisclosable,
  DEFAULT_DISCLOSURE_MODE,
  Disclosable,
  DisclosureMode,
  isDisclosureMode,
  normalizeDisclosureMode,
  switchedDisclosureMode,
  toggleDisclosureUserId,
} from '@axe/domain/disclosure/disclosure';

const make = (overrides: Partial<Disclosable> = {}): Disclosable => ({
  disclosureMode: '',
  disclosureUserIds: [],
  ...overrides,
});

describe('disclosure', () => {
  it('defaults unknown/empty mode to All (public, backward compatible)', () => {
    expect(DEFAULT_DISCLOSURE_MODE).toBe(DisclosureMode.All);
    expect(normalizeDisclosureMode('')).toBe(DisclosureMode.All);
    expect(normalizeDisclosureMode(undefined)).toBe(DisclosureMode.All);
    expect(normalizeDisclosureMode('gm')).toBe(DisclosureMode.GameMaster);
    expect(isDisclosureMode('selected')).toBe(true);
    expect(isDisclosureMode('nope')).toBe(false);
  });

  it('lets the game master view anything', () => {
    const gm = { userId: 'gm', isGameMaster: true };
    expect(canViewDisclosable(make({ disclosureMode: 'gm' }), gm)).toBe(true);
    expect(canViewDisclosable(make({ disclosureMode: 'selected', disclosureUserIds: [] }), gm)).toBe(true);
  });

  it('treats empty/all mode as visible to everyone', () => {
    const pl = { userId: 'p1', isGameMaster: false };
    expect(canViewDisclosable(make(), pl)).toBe(true);
    expect(canViewDisclosable(make({ disclosureMode: 'all' }), pl)).toBe(true);
  });

  it('hides gm-only objects from players', () => {
    const pl = { userId: 'p1', isGameMaster: false };
    expect(canViewDisclosable(make({ disclosureMode: 'gm' }), pl)).toBe(false);
  });

  it('shows selected objects only to listed users', () => {
    const obj = make({ disclosureMode: 'selected', disclosureUserIds: ['p1', 'p3'] });
    expect(canViewDisclosable(obj, { userId: 'p1', isGameMaster: false })).toBe(true);
    expect(canViewDisclosable(obj, { userId: 'p2', isGameMaster: false })).toBe(false);
  });

  it('always lets the owner view their own object', () => {
    const obj = make({ disclosureMode: 'gm' });
    expect(canViewDisclosable(obj, { userId: 'p2', isGameMaster: false, ownerUserId: 'p2' })).toBe(true);
    expect(canViewDisclosable(obj, { userId: 'p2', isGameMaster: false, ownerUserId: 'p9' })).toBe(false);
  });

  it('allows editing disclosure for GM and the owner only', () => {
    expect(canEditDisclosure({ userId: 'p1', isGameMaster: true })).toBe(true);
    expect(canEditDisclosure({ userId: 'p2', isGameMaster: false, ownerUserId: 'p2' })).toBe(true);
    expect(canEditDisclosure({ userId: 'p2', isGameMaster: false, ownerUserId: 'p9' })).toBe(false);
    expect(canEditDisclosure({ userId: 'p2', isGameMaster: false })).toBe(false);
  });

  it('toggles a user id in/out of the audience list', () => {
    expect(toggleDisclosureUserId(['a', 'b'], 'b')).toEqual(['a']);
    expect(toggleDisclosureUserId(['a'], 'c')).toEqual(['a', 'c']);
  });

  it('treats only unowned objects as claimable', () => {
    const open = { disclosureMode: 'all', disclosureUserIds: [] };
    for (const keptBackByServer of [false, true]) {
      expect(canClaimOwnership(open, { userId: 'p1', isGameMaster: false }, keptBackByServer)).toBe(true);
      expect(canClaimOwnership(open, { userId: 'p1', isGameMaster: false, ownerUserId: '' }, keptBackByServer)).toBe(
        true
      );
      expect(canClaimOwnership(open, { userId: 'p1', isGameMaster: false, ownerUserId: 'p2' }, keptBackByServer)).toBe(
        false
      );
    }
  });

  it('lets nobody claim what a room server keeps from them, as the game master’s alone', () => {
    const player = { userId: 'p1', isGameMaster: false };
    expect(canClaimOwnership({ disclosureMode: 'gm', disclosureUserIds: [] }, player, true)).toBe(false);
    expect(canClaimOwnership({ disclosureMode: 'selected', disclosureUserIds: ['p2'] }, player, true)).toBe(false);
    expect(canClaimOwnership({ disclosureMode: 'selected', disclosureUserIds: ['p1'] }, player, true)).toBe(true);
    expect(
      canClaimOwnership({ disclosureMode: 'gm', disclosureUserIds: [] }, { ...player, isGameMaster: true }, true)
    ).toBe(true);
  });

  it('lets anyone among peers claim an unowned thing, kept from them or not', () => {
    const player = { userId: 'p1', isGameMaster: false };
    expect(canClaimOwnership({ disclosureMode: 'gm', disclosureUserIds: [] }, player, false)).toBe(true);
    expect(canClaimOwnership({ disclosureMode: 'selected', disclosureUserIds: ['p2'] }, player, false)).toBe(true);
  });

  describe('switchedDisclosureMode', () => {
    it('opens everything to everyone while any of it is kept from someone', () => {
      expect(switchedDisclosureMode(['gm', 'all'])).toBe(DisclosureMode.All);
      expect(switchedDisclosureMode(['selected'])).toBe(DisclosureMode.All);
      expect(switchedDisclosureMode(['all', 'gm', 'gm'])).toBe(DisclosureMode.All);
    });

    it('keeps everything to the game master once all of it is open', () => {
      expect(switchedDisclosureMode(['all', 'all'])).toBe(DisclosureMode.GameMaster);
    });

    it('counts a mode never set as open to everyone, as everywhere else', () => {
      expect(switchedDisclosureMode(['', 'all'])).toBe(DisclosureMode.GameMaster);
      expect(switchedDisclosureMode(['', 'gm'])).toBe(DisclosureMode.All);
    });
  });
});
