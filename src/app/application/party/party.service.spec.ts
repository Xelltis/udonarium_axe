import { TestBed } from '@angular/core/testing';
import { PartyService } from '@axe/application/party/party.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Party } from '@axe/domain/party/party';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('the parties a room keeps, and who stands with whom', () => {
  let service: PartyService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    service = TestBed.inject(PartyService);
  });

  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  function made(name: string): Party {
    return service.create(name);
  }

  it('stands nobody with anybody to begin with', () => {
    const heroes = made('英雄');
    const villagers = made('村人');

    expect(service.standsWith(heroes, villagers.identifier)).toBe(false);
  });

  it('stands two together from either side of it', () => {
    const heroes = made('英雄');
    const villagers = made('村人');

    service.stand(heroes, villagers.identifier, true);

    expect(service.standsWith(heroes, villagers.identifier)).toBe(true);
    expect(service.standsWith(villagers, heroes.identifier)).toBe(true);
  });

  it('breaks it from either side, leaving no half of it written', () => {
    const heroes = made('英雄');
    const villagers = made('村人');
    service.stand(heroes, villagers.identifier, true);

    service.stand(villagers, heroes.identifier, false);

    expect(service.standsWith(heroes, villagers.identifier)).toBe(false);
    expect(heroes.allies).toBe('');
    expect(villagers.allies).toBe('');
  });

  it('stands nobody with themselves', () => {
    const heroes = made('英雄');

    service.stand(heroes, heroes.identifier, true);

    expect(heroes.allies).toBe('');
    expect(service.standsWith(heroes, heroes.identifier)).toBe(false);
  });

  it('takes a deleted party out of the lists that named it', () => {
    const heroes = made('英雄');
    const villagers = made('村人');
    service.stand(heroes, villagers.identifier, true);

    service.remove(villagers);

    expect(heroes.allies).toBe('');
  });
});
