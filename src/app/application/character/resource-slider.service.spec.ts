import { TestBed } from '@angular/core/testing';
import { ResourceSliderService } from '@axe/application/character/resource-slider.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { resourceElementsOf } from '@axe/domain/character/resource-catalog';
import { DataElement, DataElementAttribute, DataElementType } from '@axe/domain/data/data-element';
import { Config } from '@axe/domain/peer/config';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('ResourceSliderService', () => {
  let sliders: ResourceSliderService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    sliders = TestBed.inject(ResourceSliderService);
    vi.spyOn(TestBed.inject(RolePermissionService), 'canEditTabletop').mockReturnValue(true);
  });

  afterEach(() => sliders.setRoomDefault(false));

  it('gives no resource a slider of the room until the room says so', () => {
    expect(sliders.roomDefault()).toBe(false);
  });

  it('keeps the room default in the room config, where every peer reads it', () => {
    sliders.setRoomDefault(true);

    expect(sliders.roomDefault()).toBe(true);
    expect(ObjectStore.instance.get<Config>('Config')?.resourceSliderByDefault).toBe(true);
  });

  it('answers by the room for a resource that says nothing of its own', () => {
    const hp = DataElement.create('HP', 20, { type: DataElementType.NUMBER_RESOURCE });
    expect(sliders.shows(hp)).toBe(false);

    sliders.setRoomDefault(true);

    expect(sliders.shows(hp)).toBe(true);
  });

  it('gives every resource of a piece a slider, and takes every one away, whatever the room gives', () => {
    const piece = GameCharacter.create('戦士', 1, '');
    const resources = resourceElementsOf(piece);
    expect(resources.length).toBeGreaterThan(1);
    sliders.setRoomDefault(true);

    sliders.setAll(piece, false);
    expect(resources.map((element) => element.getAttribute(DataElementAttribute.RESOURCE_SLIDER))).toEqual(
      resources.map(() => 'false')
    );
    expect(resources.some((element) => sliders.shows(element))).toBe(false);

    sliders.setAll(piece, true);
    expect(resources.every((element) => sliders.shows(element))).toBe(true);
  });

  it('leaves the fields that are not resources alone', () => {
    const piece = GameCharacter.create('戦士', 1, '');
    const note = DataElement.create('メモ', 'テキスト');
    piece.detailDataElement!.appendChild(note);

    sliders.setAll(piece, true);

    expect(note.getAttribute(DataElementAttribute.RESOURCE_SLIDER)).toBe('');
  });

  it('offers the switch only to a seat that may change the table, and only for a piece with a resource', () => {
    const piece = GameCharacter.create('戦士', 1, '');
    const bare = new GameCharacter('bare');
    bare.initialize();
    expect(sliders.maySetAll(piece)).toBe(true);
    expect(sliders.maySetAll(bare)).toBe(false);

    vi.spyOn(TestBed.inject(RolePermissionService), 'canEditTabletop').mockReturnValue(false);
    sliders.setAll(piece, true);

    expect(sliders.maySetAll(piece)).toBe(false);
    expect(
      resourceElementsOf(piece).every((element) => element.getAttribute(DataElementAttribute.RESOURCE_SLIDER) === '')
    ).toBe(true);
  });
});
