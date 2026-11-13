import { TestBed } from '@angular/core/testing';
import {
  DEFAULT_SYSTEM_AVATAR_URL,
  DEFAULT_SYSTEM_DICE_AVATAR_URL,
  NO_SYSTEM_AVATAR,
  SystemAvatarService,
} from '@axe/application/chat/system-avatar.service';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { Config } from '@axe/domain/peer/config';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('SystemAvatarService', () => {
  let service: SystemAvatarService;
  let config: Config;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    config = Config.instance;
    config.systemAvatarIdentifier = '';
    config.systemDiceAvatarIdentifier = '';
    config.isSystemAvatarVisible = true;
    config.isSpeakerAvatarVisible = false;
    service = TestBed.inject(SystemAvatarService);
  });

  it('falls back to the pictures that ship with the app', () => {
    expect(service.systemUrl()).toBe(DEFAULT_SYSTEM_AVATAR_URL);
    expect(service.diceUrl()).toBe(DEFAULT_SYSTEM_DICE_AVATAR_URL);
  });

  it('shows the avatar until the room says otherwise', () => {
    expect(service.isVisible()).toBe(true);

    service.setVisible(false);

    expect(service.isVisible()).toBe(false);
  });

  it('keeps the speaker out of the mascot slot until the room asks for it', () => {
    expect(service.isSpeakerVisible()).toBe(false);

    service.setSpeakerVisible(true);

    expect(service.isSpeakerVisible()).toBe(true);
    expect(config.isSpeakerAvatarVisible).toBe(true);
  });

  it('carries the visibility into the room settings', () => {
    service.setVisible(false);

    expect(config.isSystemAvatarVisible).toBe(false);
  });

  it('serves the picture the room has chosen', () => {
    const image = TestBed.inject(ImageStorage).add('https://example.com/system.png');
    service.setImage('system', image.identifier);

    expect(service.systemUrl()).toBe(image.url);
    expect(service.diceUrl()).toBe(DEFAULT_SYSTEM_DICE_AVATAR_URL);
  });

  it('keeps the dice picture apart from the plain one', () => {
    const image = TestBed.inject(ImageStorage).add('https://example.com/dice.png');
    service.setImage('dice', image.identifier);

    expect(service.diceUrl()).toBe(image.url);
    expect(service.systemUrl()).toBe(DEFAULT_SYSTEM_AVATAR_URL);
  });

  it('knows which pictures the room has chosen for itself', () => {
    expect(service.hasOwnSystemImage()).toBe(false);

    service.setImage('system', 'some-image');

    expect(service.hasOwnSystemImage()).toBe(true);
    expect(service.hasOwnDiceImage()).toBe(false);
  });

  it('puts the picture that ships with the app back', () => {
    service.setImage('dice', 'some-image');

    service.resetImage('dice');

    expect(service.identifierOf('dice')).toBe('');
    expect(service.diceUrl()).toBe(DEFAULT_SYSTEM_DICE_AVATAR_URL);
  });

  it('draws nothing for the kind the room picked no picture for', () => {
    service.setImage('system', NO_SYSTEM_AVATAR);

    expect(service.systemUrl()).toBe('');
    expect(service.diceUrl()).toBe(DEFAULT_SYSTEM_DICE_AVATAR_URL);
  });

  it('offers the reset once no picture has been picked, so the shipped one can come back', () => {
    service.setImage('dice', NO_SYSTEM_AVATAR);

    expect(service.hasOwnDiceImage()).toBe(true);

    service.resetImage('dice');

    expect(service.diceUrl()).toBe(DEFAULT_SYSTEM_DICE_AVATAR_URL);
  });

  it('falls back to the shipped picture while a chosen one has yet to arrive', () => {
    service.setImage('system', 'not-shared-yet');

    expect(service.systemUrl()).toBe(DEFAULT_SYSTEM_AVATAR_URL);
  });
});
