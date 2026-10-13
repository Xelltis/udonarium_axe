import { TestBed } from '@angular/core/testing';
import { VolumeType } from '@axe/core/storage/audio-player';
import { ObjectContext } from '@axe/core/sync/game-object';
import { waitZeroTimeout } from '@axe/core/util/zero-timeout';
import { OPEN_STAMP_RULES, withStampsAllowed, withStampUseOn } from '@axe/domain/chat/stamp-rules';
import { DEFAULT_DJ_SETTINGS } from '@axe/domain/media/dj-settings';
import { Jukebox } from '@axe/domain/media/jukebox';
import { DEFAULT_ROOM_VOLUMES } from '@axe/domain/media/room-volumes';
import { Config } from '@axe/domain/peer/config';

describe('Config', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
    (Config as unknown as { _instance: Config | undefined })._instance = undefined;
  });

  afterEach(async () => {
    // Creating the config queues work on the network and the store through a zero timeout,
    // and unless those queues are drained before the objects are deleted an error can be
    // thrown after the test has finished.
    await waitZeroTimeout();
    (Config as unknown as { _instance: Config | undefined })._instance = undefined;
  });

  describe('engagement-zone rules', () => {
    it('answers nothing for a room saved before it could, so the defaults are played', () => {
      expect(Config.instance.zoneRuleAnswers).toEqual({
        enabled: null,
        sizes: null,
        countField: null,
        samePointM: null,
        outnumber: null,
        leaveKind: null,
        blockRadiusM: null,
        clearName: null,
      });
      expect(Config.instance.moveKinds).toBeNull();
    });

    it('reads back what it writes, and empty again for null', () => {
      const config = Config.instance;
      config.zoneEnabled = true;
      config.zoneSizes = '4:2:3';
      config.zoneCountField = '体数';
      config.zoneSamePointM = 0;
      config.zoneOutnumber = 3;
      config.zoneLeaveKind = '全力';
      config.moveKinds = '全力:3:,通常:1:';

      expect(config.zoneRuleAnswers).toEqual({
        enabled: true,
        sizes: '4:2:3',
        countField: '体数',
        samePointM: 0,
        outnumber: 3,
        leaveKind: '全力',
        blockRadiusM: null,
        clearName: null,
      });
      expect(config.moveKinds).toBe('全力:3:,通常:1:');

      config.zoneEnabled = null;
      config.zoneSizes = null;
      config.zoneCountField = null;
      config.zoneSamePointM = null;
      config.zoneOutnumber = null;
      config.zoneLeaveKind = null;
      config.moveKinds = null;
      expect(config.moveKinds).toBeNull();
      expect(config.zoneRuleAnswers).toEqual({
        enabled: null,
        sizes: null,
        countField: null,
        samePointM: null,
        outnumber: null,
        leaveKind: null,
        blockRadiusM: null,
        clearName: null,
      });
    });
  });

  describe('drawing a move as straight legs', () => {
    it('is off for a room saved before it could be asked, and reads back what it writes', () => {
      const config = Config.instance;
      expect(config.pathMove).toBe(false);

      config.pathMove = true;
      expect(config.pathMove).toBe(true);
      config.pathMove = false;
      expect(config.pathMove).toBe(false);
    });
  });

  describe('stepping into a move', () => {
    it('is off for a room saved before it could be asked, with no kind named, and reads back what it writes', () => {
      const config = Config.instance;
      expect(config.interruptEnabled).toBe(false);
      expect(config.interruptKind).toBeNull();

      config.interruptEnabled = true;
      config.interruptKind = '全力';
      expect(config.interruptEnabled).toBe(true);
      expect(config.interruptKind).toBe('全力');

      config.interruptKind = null;
      expect(config.interruptKind).toBeNull();
    });
  });

  describe('setting the sides out', () => {
    it('has no tables for a room saved before it could, and reads back what it writes', () => {
      const config = Config.instance;
      expect(config.placementDistances).toBeNull();
      expect(config.distanceModifiers).toBeNull();

      config.placementDistances = '近い:10';
      config.distanceModifiers = '10:修正なし';
      expect(config.placementDistances).toBe('近い:10');
      expect(config.distanceModifiers).toBe('10:修正なし');
    });
  });

  describe('instance (singleton)', () => {
    it('returns the one instance', () => {
      const instance1 = Config.instance;
      const instance2 = Config.instance;
      expect(instance1).toBe(instance2);
    });

    it('identifies itself as the config', () => {
      expect(Config.instance.identifier).toBe('Config');
    });
  });

  describe('defaultDiceBot', () => {
    it('starts with the default dice bot', () => {
      expect(Config.instance.defaultDiceBot).toBe('DiceBot');
    });

    it('returns the value it is given', () => {
      Config.instance.defaultDiceBot = 'Cthulhu7th';
      expect(Config.instance.defaultDiceBot).toBe('Cthulhu7th');
    });

    it('falls back to that default for an empty one', () => {
      Config.instance.defaultDiceBot = '';
      expect(Config.instance.defaultDiceBot).toBe('DiceBot');
    });
  });

  describe('roomVolume', () => {
    it('starts at full', () => {
      expect(Config.instance.roomVolume).toBe(1.0);
    });

    it('returns the value it is given', () => {
      Config.instance.roomVolume = 0.5;
      expect(Config.instance.roomVolume).toBe(0.5);
    });
  });

  describe('the room’s volume for each kind of sound', () => {
    const setNewVolume = vi.fn();

    function attributesOf(context: ObjectContext): Record<string, unknown> {
      return context.syncData['attributes'] as Record<string, unknown>;
    }

    beforeEach(() => {
      setNewVolume.mockClear();
      vi.spyOn(Config.instance, 'jukebox', 'get').mockReturnValue({ setNewVolume } as unknown as Jukebox);
    });

    afterEach(() => vi.restoreAllMocks());

    it('starts at full for every kind', () => {
      expect(Config.instance.roomVolumes).toEqual(DEFAULT_ROOM_VOLUMES);
    });

    it('sets one kind, leaving the others as they are', () => {
      Config.instance.setRoomVolumeOf('bgm', 0.5);
      Config.instance.setRoomVolumeOf('handling', 0);

      expect(Config.instance.roomVolumes).toEqual({ ...DEFAULT_ROOM_VOLUMES, bgm: 0.5, handling: 0 });
    });

    it('scales each channel by the master room volume and its own kind, and previews by the master alone', () => {
      Config.instance.roomVolume = 0.5;
      Config.instance.setRoomVolumeOf('bgm', 1.6);
      Config.instance.setRoomVolumeOf('effect', 0);

      expect(Config.instance.roomScaleFor(VolumeType.MASTER)).toBeCloseTo(0.8);
      expect(Config.instance.roomScaleFor(VolumeType.EFFECT)).toBe(0);
      expect(Config.instance.roomScaleFor(VolumeType.SE)).toBe(0.5);
      expect(Config.instance.roomScaleFor(VolumeType.AUDITION)).toBe(0.5);
    });

    it('reads full for every kind from an older version that sends none', () => {
      Config.instance.setRoomVolumeOf('bgm', 0.5);
      const older = Config.instance.toContext();
      delete attributesOf(older)['_roomKindVolumes'];
      older.majorVersion += 1;

      Config.instance.apply(older);

      expect(Config.instance.roomVolumes).toEqual(DEFAULT_ROOM_VOLUMES);
      expect(Config.instance.roomScaleFor(VolumeType.MASTER)).toBe(1);
    });

    it('keeps the volumes when an older version that passed them along sends the config back', () => {
      Config.instance.setRoomVolumeOf('background', 0.3);
      const passedAlong = Config.instance.toContext();
      attributesOf(passedAlong)['_roomVolume'] = 0.8;
      passedAlong.majorVersion += 1;

      Config.instance.apply(passedAlong);

      expect(Config.instance.roomVolume).toBe(0.8);
      expect(Config.instance.roomVolumes.background).toBe(0.3);
    });

    it('puts a change from another peer on the jukebox straight away', () => {
      const changed = Config.instance.toContext();
      attributesOf(changed)['_roomKindVolumes'] = '{"bgm":0.2}';
      changed.majorVersion += 1;

      Config.instance.apply(changed);

      expect(setNewVolume).toHaveBeenCalled();
      expect(Config.instance.roomVolumes.bgm).toBe(0.2);
    });
  });

  describe('the room’s mix', () => {
    function attributesOf(context: ObjectContext): Record<string, unknown> {
      return context.syncData['attributes'] as Record<string, unknown>;
    }

    afterEach(() => vi.restoreAllMocks());

    it('levels sounds, ducks the music and crossfades for two seconds until the game master says otherwise', () => {
      expect(Config.instance.djSettings).toEqual(DEFAULT_DJ_SETTINGS);
      expect(DEFAULT_DJ_SETTINGS).toEqual({
        autoLevel: true,
        ducking: true,
        crossfadeS: 2,
        pauseFadeS: 0.4,
        quantize: false,
        beatLight: false,
      });
    });

    it('keeps what is set', () => {
      Config.instance.djSettings = { ...DEFAULT_DJ_SETTINGS, ducking: false, crossfadeS: 8 };

      expect(Config.instance.djSettings).toEqual({ ...DEFAULT_DJ_SETTINGS, ducking: false, crossfadeS: 8 });
    });

    it('mixes as a new room does for an older version that sends none', () => {
      Config.instance.djSettings = { ...DEFAULT_DJ_SETTINGS, autoLevel: false };
      const older = Config.instance.toContext();
      delete attributesOf(older)['_djSettings'];
      older.majorVersion += 1;

      Config.instance.apply(older);

      expect(Config.instance.djSettings).toEqual(DEFAULT_DJ_SETTINGS);
    });

    it('keeps the mix when an older version that passed it along sends the config back', () => {
      Config.instance.djSettings = { ...DEFAULT_DJ_SETTINGS, quantize: true };
      const passedAlong = Config.instance.toContext();
      attributesOf(passedAlong)['_hideSystemAvatar'] = '1';
      passedAlong.majorVersion += 1;

      Config.instance.apply(passedAlong);

      expect(Config.instance.djSettings.quantize).toBe(true);
    });

    it('keeps the pads, every one empty for an older version that sends none', () => {
      Config.instance.djPads = ['airhorn', '', '', '', '', '', '', 'applause'];
      expect(Config.instance.djPads[7]).toBe('applause');

      const older = Config.instance.toContext();
      delete attributesOf(older)['_djPads'];
      older.majorVersion += 1;
      Config.instance.apply(older);

      expect(Config.instance.djPads.every((pad) => pad === '')).toBe(true);
    });

    it('remixes on the jukebox straight away when another peer changes the mix', () => {
      const jukebox = new Jukebox('Jukebox');
      jukebox.initialize();
      const refreshMix = vi.spyOn(jukebox, 'refreshMix').mockImplementation(() => {});
      const changed = Config.instance.toContext();
      attributesOf(changed)['_djSettings'] = '{"ducking":false}';
      changed.majorVersion += 1;

      Config.instance.apply(changed);

      expect(refreshMix).toHaveBeenCalledOnce();
      expect(Config.instance.djSettings.ducking).toBe(false);
    });
  });

  describe('what the room lets its stamps be used for', () => {
    function attributesOf(context: ObjectContext): Record<string, unknown> {
      return context.syncData['attributes'] as Record<string, unknown>;
    }

    afterEach(() => {
      Config.instance.stampRules = OPEN_STAMP_RULES;
    });

    it('lets every stamp be used for everything in a room saved before there were rules', () => {
      Config.instance.stampRules = withStampUseOn(OPEN_STAMP_RULES, 'reaction', false);
      const older = Config.instance.toContext();
      delete attributesOf(older)['_stampRules'];
      older.majorVersion += 1;

      Config.instance.apply(older);

      expect(Config.instance.stampRules).toEqual(OPEN_STAMP_RULES);
    });

    it('passes the rules on with the rest of the config', () => {
      Config.instance.stampRules = withStampsAllowed(OPEN_STAMP_RULES, 'line', ['seal:ok'], false);

      expect(attributesOf(Config.instance.toContext())['_stampRules']).toBe('{"line":{"deny":["seal:ok"]}}');
    });
  });

  describe('whether what a character says shows over its piece', () => {
    function attributesOf(context: ObjectContext): Record<string, unknown> {
      return context.syncData['attributes'] as Record<string, unknown>;
    }

    afterEach(() => {
      Config.instance.speechBubblesEnabled = true;
    });

    it('shows it in a room saved before the switch, and in one holding a value it does not know', () => {
      Config.instance.speechBubblesEnabled = false;
      const older = Config.instance.toContext();
      delete attributesOf(older)['_speechBubbles'];
      older.majorVersion += 1;
      Config.instance.apply(older);
      expect(Config.instance.speechBubblesEnabled).toBe(true);

      const newer = Config.instance.toContext();
      attributesOf(newer)['_speechBubbles'] = 'from-a-newer-version';
      newer.majorVersion += 1;
      Config.instance.apply(newer);
      expect(Config.instance.speechBubblesEnabled).toBe(true);
    });

    it('passes the room turning it off on with the rest of the config', () => {
      Config.instance.speechBubblesEnabled = false;

      expect(attributesOf(Config.instance.toContext())['_speechBubbles']).toBe('off');
      expect(Config.instance.speechBubblesEnabled).toBe(false);
    });
  });

  describe('how the round is taken', () => {
    it('takes the round one piece at a time until it is told otherwise', () => {
      expect(Config.instance.turnOrderMode).toBe('initiative');
      expect(Config.instance.factionPhaseMode).toBe('free');
      expect(Config.instance.factionOrder).toBe('');
      expect(Config.instance.factionSkipUnassigned).toBe(false);
    });

    it('returns the modes it is given', () => {
      Config.instance.turnOrderMode = 'faction';
      Config.instance.factionPhaseMode = 'initiative';

      expect(Config.instance.turnOrderMode).toBe('faction');
      expect(Config.instance.factionPhaseMode).toBe('initiative');
    });

    it('holds the order of the sides as it is written', () => {
      Config.instance.factionOrder = 'p-a,p-b';

      expect(Config.instance.factionOrder).toBe('p-a,p-b');
    });

    it('reads a mode it does not know as the one it starts on', () => {
      Config.instance.setAttribute('_turnOrderMode', 'sides');

      expect(Config.instance.turnOrderMode).toBe('initiative');
    });

    it('reads the flag back the way a loaded room writes it', () => {
      Config.instance.factionSkipUnassigned = true;
      Config.instance.setAttribute(
        '_factionSkipUnassigned',
        `${Config.instance.getAttribute('_factionSkipUnassigned')}`
      );

      expect(Config.instance.factionSkipUnassigned).toBe(true);
    });
  });

  describe('the rules of play', () => {
    it('answers nothing at all until it is asked', () => {
      expect(Config.instance.roomRuleAnswers).toEqual({
        moveRangeEnabled: null,
        moveRangeElementNames: null,
        moveDiagonally: null,
        diagonalMove: null,
        piecesShareCells: null,
        samePartyPassage: null,
        otherPartyPassage: null,
        noPartyPassage: null,
        piecePassageCost: null,
        sizeSlipsPast: null,
        squeezes: null,
        jumpCells: null,
        handTracesWay: null,
        moveRangeAlways: null,
        zocAlways: null,
        cellDistance: null,
        cellDistanceUnit: null,
        zocMode: null,
        hostilityBy: null,
        zocRange: null,
        zocExtraCost: null,
        zocEngages: null,
        breakOutMode: null,
        breakOutCost: null,
        engagementCountsSize: null,
        facingMark: null,
        pieceImageInCell: null,
      });
    });

    it('holds on to an answer of no rather than forgetting it was asked', () => {
      Config.instance.moveDiagonally = false;
      Config.instance.piecesShareCells = false;

      expect(Config.instance.moveDiagonally).toBe(false);
      expect(Config.instance.piecesShareCells).toBe(false);
    });

    it('tells an older peer whether a corner may be cut at all', () => {
      Config.instance.diagonalMove = 'double';

      expect(Config.instance.diagonalMove).toBe('double');
      expect(Config.instance.moveDiagonally).toBe(true);

      Config.instance.diagonalMove = 'none';

      expect(Config.instance.moveDiagonally).toBe(false);
    });

    it('gives the corner rule back to the table together with the older answer', () => {
      Config.instance.diagonalMove = 'alternating';
      Config.instance.diagonalMove = null;

      expect(Config.instance.diagonalMove).toBeNull();
      expect(Config.instance.moveDiagonally).toBeNull();
    });

    it('holds on to a count of nought', () => {
      Config.instance.zocExtraCost = 0;

      expect(Config.instance.zocExtraCost).toBe(0);
    });

    it('gives an answer back to the table when it is taken away', () => {
      Config.instance.zocMode = 'stop';
      Config.instance.zocRange = 2;

      Config.instance.zocMode = null;
      Config.instance.zocRange = null;

      expect(Config.instance.zocMode).toBeNull();
      expect(Config.instance.zocRange).toBeNull();
    });

    it('answers nothing where the attributes were never written, rather than answering nought', () => {
      // What an older build hands over carries none of these, and a bag with nothing in it
      // is what is left. A count read as 0 there would rule that a cell stands for nothing.
      Config.instance.cellDistance = 5;
      Config.instance.zocMode = 'stop';
      Config.instance.moveDiagonally = false;

      for (const attribute of ['_cellDistance', '_zocMode', '_moveDiagonally']) {
        Config.instance.removeAttribute(attribute);
      }

      expect(Config.instance.cellDistance).toBeNull();
      expect(Config.instance.zocMode).toBeNull();
      expect(Config.instance.moveDiagonally).toBeNull();
      expect(Config.instance.turnOrderMode).toBe('initiative');
      expect(Config.instance.factionSkipUnassigned).toBe(false);
    });

    it('reads an answer back out of the text an attribute carries', () => {
      Config.instance.moveRangeEnabled = false;
      Config.instance.cellDistance = 5;

      for (const attribute of ['_moveRangeEnabled', '_cellDistance']) {
        Config.instance.setAttribute(attribute, `${Config.instance.getAttribute(attribute)}`);
      }

      expect(Config.instance.moveRangeEnabled).toBe(false);
      expect(Config.instance.cellDistance).toBe(5);
    });
  });

  describe('the items the remote controllers show', () => {
    it('shows every item until the room picks some out', () => {
      expect(Config.instance.controllerResources).toBeNull();
    });

    it('returns the pick it is given, a pick of nothing included', () => {
      Config.instance.controllerResources = ['HP', 'MP'];
      expect(Config.instance.controllerResources).toEqual(['HP', 'MP']);

      Config.instance.controllerResources = [];
      expect(Config.instance.controllerResources).toEqual([]);
    });

    it('goes back to showing everything when the pick is taken away', () => {
      Config.instance.controllerResources = ['HP'];

      Config.instance.controllerResources = null;

      expect(Config.instance.controllerResources).toBeNull();
    });

    it('shows everything for a room from an older build, which carries no attribute for it', () => {
      Config.instance.controllerResources = ['HP'];

      Config.instance.removeAttribute('_controllerResources');

      expect(Config.instance.controllerResources).toBeNull();
    });

    it('reads the pick back out of the text a loaded room carries', () => {
      Config.instance.controllerResources = ['HP', '敏捷度'];

      Config.instance.setAttribute('_controllerResources', `${Config.instance.getAttribute('_controllerResources')}`);

      expect(Config.instance.controllerResources).toEqual(['HP', '敏捷度']);
    });
  });

  describe('diceStage', () => {
    const attributesOf = (syncData: unknown) => (syncData as { attributes: Record<string, unknown> }).attributes;

    it('throws no dice anywhere until the room chooses where', () => {
      expect(Config.instance.diceStage).toBe('off');
    });

    it('keeps where the room chose', () => {
      Config.instance.diceStage = 'frame';
      expect(Config.instance.diceStage).toBe('frame');

      Config.instance.diceStage = 'table';
      expect(Config.instance.diceStage).toBe('table');

      Config.instance.diceStage = 'both';
      expect(Config.instance.diceStage).toBe('both');
    });

    it('writes nowhere as empty, the same as a room that never chose', () => {
      Config.instance.diceStage = 'table';

      Config.instance.diceStage = 'off';

      expect(Config.instance.getAttribute('_diceStage')).toBe('');
      expect(Config.instance.toXml()).toContain('_diceStage=""');
    });

    it('throws nothing in a room from an older build, which carries no attribute for it', () => {
      Config.instance.diceStage = 'frame';

      Config.instance.removeAttribute('_diceStage');

      expect(Config.instance.diceStage).toBe('off');
    });

    it('reads the choice back out of the text a loaded room carries', () => {
      Config.instance.setAttribute('_diceStage', 'table');

      expect(Config.instance.diceStage).toBe('table');
    });

    it('throws nothing for a value it does not know, such as one a later build might write', () => {
      Config.instance.setAttribute('_diceStage', 'sky');

      expect(Config.instance.diceStage).toBe('off');
    });

    it('throws nothing when an older peer sends the config without the setting', () => {
      Config.instance.diceStage = 'frame';
      const context = Config.instance.toContext();
      delete attributesOf(context.syncData)['_diceStage'];
      context.majorVersion += 1;

      Config.instance.apply(context);

      expect(Config.instance.diceStage).toBe('off');
    });

    it('keeps the choice when an older peer writes the config back with the attribute it was sent', () => {
      Config.instance.diceStage = 'table';
      const echoed = Config.instance.toContext();
      attributesOf(echoed.syncData)['_defaultDiceBot'] = 'Cthulhu7th';
      echoed.majorVersion += 1;

      Config.instance.apply(echoed);

      expect(Config.instance.diceStage).toBe('table');
      expect(Config.instance.defaultDiceBot).toBe('Cthulhu7th');
    });
  });

  describe('system avatar', () => {
    it('starts with no picture of its own', () => {
      expect(Config.instance.systemAvatarIdentifier).toBe('');
      expect(Config.instance.systemDiceAvatarIdentifier).toBe('');
    });

    it('returns the pictures it is given', () => {
      Config.instance.systemAvatarIdentifier = 'image-a';
      Config.instance.systemDiceAvatarIdentifier = 'image-b';

      expect(Config.instance.systemAvatarIdentifier).toBe('image-a');
      expect(Config.instance.systemDiceAvatarIdentifier).toBe('image-b');
    });

    it('shows the avatar until it is asked not to', () => {
      expect(Config.instance.isSystemAvatarVisible).toBe(true);

      Config.instance.isSystemAvatarVisible = false;

      expect(Config.instance.isSystemAvatarVisible).toBe(false);
    });

    it('keeps the speaker to itself until it is asked for', () => {
      expect(Config.instance.isSpeakerAvatarVisible).toBe(false);

      Config.instance.isSpeakerAvatarVisible = true;

      expect(Config.instance.isSpeakerAvatarVisible).toBe(true);
    });

    it('reads the flag back the way a loaded room writes it', () => {
      Config.instance.isSystemAvatarVisible = false;
      Config.instance.setAttribute('_hideSystemAvatar', `${Config.instance.getAttribute('_hideSystemAvatar')}`);

      expect(Config.instance.isSystemAvatarVisible).toBe(false);

      Config.instance.isSystemAvatarVisible = true;
      Config.instance.setAttribute('_hideSystemAvatar', `${Config.instance.getAttribute('_hideSystemAvatar')}`);

      expect(Config.instance.isSystemAvatarVisible).toBe(true);
    });
  });
});
