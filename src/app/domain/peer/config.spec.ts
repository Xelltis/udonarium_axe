import { TestBed } from '@angular/core/testing';
import { waitZeroTimeout } from '@axe/core/util/zero-timeout';
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

  describe('the rules of play', () => {
    it('answers nothing at all until it is asked', () => {
      expect(Config.instance.roomRuleAnswers).toEqual({
        moveRangeEnabled: null,
        moveRangeElementNames: null,
        moveDiagonally: null,
        piecesShareCells: null,
        moveRangeAlways: null,
        zocAlways: null,
        cellDistance: null,
        cellDistanceUnit: null,
        zocMode: null,
        zocRange: null,
        zocExtraCost: null,
      });
    });

    it('holds on to an answer of no rather than forgetting it was asked', () => {
      Config.instance.moveDiagonally = false;
      Config.instance.piecesShareCells = false;

      expect(Config.instance.moveDiagonally).toBe(false);
      expect(Config.instance.piecesShareCells).toBe(false);
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
