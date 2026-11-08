import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement } from '@axe/domain/data/data-element';
import { GameCharacterBuffViewComponent } from '@axe/features/character/game-character-buff-view/game-character-buff-view.component';
import { expectClosesForAGuest } from '@axe/testing/closes-for-a-guest';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('GameCharacterBuffViewComponent', () => {
  let component: GameCharacterBuffViewComponent;
  let fixture: ComponentFixture<GameCharacterBuffViewComponent>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [GameCharacterBuffViewComponent],
      providers: [...TEST_PROVIDERS],
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

  it('says so while the list of buffs holds nothing at all', () => {
    const character = GameCharacter.create('テスト', 1, '');
    const buffs = character.buffDataElement!;
    for (const child of [...buffs.children]) buffs.removeChild(child as DataElement);
    component.character.set(character);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('バフ・デバフは登録されていません');
  });

  it('takes a buff off with the bin on its row, leaving the others', () => {
    const character = GameCharacter.create('テスト', 1, '');
    component.character.set(character);
    component.addBuff();
    component.addBuff();
    fixture.detectChanges();
    const bins = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
      'button[title="バフを削除"]'
    );
    expect(bins).toHaveLength(2);

    bins[0].click();

    const container = character.buffDataElement!.children[0] as DataElement;
    expect(container.children).toHaveLength(1);
  });
});
