import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement } from '@axe/domain/data/data-element';
import {
  CharacterPortraitPanelComponent,
  MAX_PORTRAIT_POSITION,
} from '@axe/features/character/game-character-sheet/character-portrait-panel.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('CharacterPortraitPanelComponent', () => {
  let component: CharacterPortraitPanelComponent;
  let fixture: ComponentFixture<CharacterPortraitPanelComponent>;
  let character: GameCharacter;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CharacterPortraitPanelComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
    character = GameCharacter.create('立ち絵持ち', 1, '');
    character.addExtendData();
    character.imageDataElement!.appendChild(DataElement.create('imageIdentifier', 'img-1', { type: 'image' }, ''));
    fixture = TestBed.createComponent(CharacterPortraitPanelComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('character', character);
    fixture.detectChanges();
  });

  afterEach(() => character.destroy());

  function changeEvent(value: string): Event {
    return { target: { value } } as unknown as Event;
  }

  describe('naming a portrait', () => {
    it('starts with no name on any portrait', () => {
      expect(component.portraitName()).toBe('');
      expect(component.portraitImages().map((portrait) => portrait.name)).toEqual(['', '']);
    });

    it('writes the name onto the portrait that is picked out', () => {
      component.setKomaIndex(1);
      component.setPortraitName(changeEvent('笑顔'));

      expect(component.portraitName()).toBe('笑顔');
      expect(component.portraitImages().map((portrait) => portrait.name)).toEqual(['', '笑顔']);
    });

    it('leaves the other portraits alone', () => {
      component.setKomaIndex(0);
      component.setPortraitName(changeEvent('通常'));
      component.setKomaIndex(1);
      component.setPortraitName(changeEvent('笑顔'));

      expect(component.portraitImages().map((portrait) => portrait.name)).toEqual(['通常', '笑顔']);
    });
  });

  it('picks which portrait the piece shows, within the ones it has', () => {
    component.setKomaIndex(5);

    expect(component.komaImageIndex()).toBe(1);
  });

  it('removes a portrait and keeps the piece on the picture it showed', () => {
    character.imageDataElement!.appendChild(DataElement.create('imageIdentifier', 'img-2', { type: 'image' }, ''));
    component.setKomaIndex(2);

    component.removePortrait(0);

    expect(component.portraitImages()).toHaveLength(2);
    expect(component.komaImageIndex()).toBe(1);
  });

  it('never removes the last portrait', () => {
    component.removePortrait(1);
    component.removePortrait(0);

    expect(component.portraitImages()).toHaveLength(1);
  });

  it('keeps the place in the chat within the places there are', () => {
    component.setPortraitPos(MAX_PORTRAIT_POSITION + 3);
    expect(character.portraitPosition).toBe(MAX_PORTRAIT_POSITION);

    component.setPortraitPos(-1);
    expect(character.portraitPosition).toBe(0);
  });
});
