import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement } from '@axe/domain/data/data-element';
import { GameCharacterBuffViewComponent } from '@axe/features/character/game-character-buff-view/game-character-buff-view.component';
import { expectClosesForAGuest } from '@axe/testing/closes-for-a-guest';

describe('GameCharacterBuffViewComponent', () => {
  let component: GameCharacterBuffViewComponent;
  let fixture: ComponentFixture<GameCharacterBuffViewComponent>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [GameCharacterBuffViewComponent],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(GameCharacterBuffViewComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  it('closes once its seat is made a guest, who may no longer write what it writes', () => {
    expectClosesForAGuest(() => TestBed.createComponent(GameCharacterBuffViewComponent));
  });

  it('should be created', () => {
    expect(component).toBeTruthy();
  });

  it('adds a buff among the ones the round counts down, a row of its own each time', () => {
    const character = GameCharacter.create('テスト', 1, '');
    component.character.set(character);

    component.addBuff();
    component.addBuff();

    const container = character.buffDataElement!.children[0] as DataElement;
    expect(character.buffDataElement!.children).toHaveLength(1);
    expect(container.children).toHaveLength(2);
    expect((container.children[0] as DataElement).value).toBe(1);
    expect(character.buffs.expireOneRound()).toHaveLength(2);
  });
});
