import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Card, CardState } from '@axe/domain/card/card';
import { SheetCardFormComponent } from '@axe/features/character/game-character-sheet/sheet-card-form.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('SheetCardFormComponent', () => {
  let fixture: ComponentFixture<SheetCardFormComponent>;
  let component: SheetCardFormComponent;

  function root(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [SheetCardFormComponent], providers: [...TEST_PROVIDERS] });
    fixture = TestBed.createComponent(SheetCardFormComponent);
    component = fixture.componentInstance;
  });

  it('passes its buttons on to the sheet: editing, either face, copying and saving', () => {
    const card = Card.create('Buttons', 'front.png', 'back.png');
    fixture.componentRef.setInput('card', card);
    const pressed: string[] = [];
    component.editToggled.subscribe(() => pressed.push('edit'));
    component.imagePick.subscribe((face) => pressed.push(face));
    component.copyPressed.subscribe(() => pressed.push('copy'));
    component.savePressed.subscribe(() => pressed.push('save'));

    try {
      fixture.detectChanges();
      const buttons = [...root().querySelectorAll<HTMLButtonElement>('button')];
      for (const button of buttons) button.click();

      expect(pressed).toEqual(['edit', 'copy', 'save', 'front', 'back']);
    } finally {
      card.destroy();
    }
  });

  it('offers to add game data only while the sheet is being edited', () => {
    const card = Card.create('Editing', 'front.png', 'back.png');
    fixture.componentRef.setInput('card', card);
    let added = 0;
    component.addPressed.subscribe(() => added++);

    try {
      fixture.detectChanges();
      const before = root().querySelectorAll('button').length;

      fixture.componentRef.setInput('isEdit', true);
      fixture.detectChanges();
      const buttons = [...root().querySelectorAll<HTMLButtonElement>('button')];
      expect(buttons.length).toBeGreaterThan(before);
      buttons[buttons.length - 1].click();

      expect(added).toBe(1);
    } finally {
      card.destroy();
    }
  });

  it('writes the name and the size, the size rounded and held between 1 and 20', () => {
    const card = Card.create('Named', 'front.png', 'back.png');
    fixture.componentRef.setInput('card', card);

    try {
      fixture.detectChanges();
      const name = root().querySelector<HTMLInputElement>('input[type="text"]')!;
      name.value = 'Renamed';
      name.dispatchEvent(new Event('change'));
      const size = root().querySelector<HTMLInputElement>('input[type="number"][max="20"]')!;
      size.value = '99';
      size.dispatchEvent(new Event('change'));

      expect(card.name).toBe('Renamed');
      expect(card.size).toBe(20);
    } finally {
      card.destroy();
    }
  });

  it('holds the popup the card opens to the sizes a popup may have', () => {
    const card = Card.create('Popup', 'front.png', 'back.png');
    fixture.componentRef.setInput('card', card);

    try {
      fixture.detectChanges();
      const width = root().querySelector<HTMLInputElement>('input[name="card-overview-width-number"]')!;
      width.value = '5000';
      width.dispatchEvent(new Event('change'));
      const height = root().querySelector<HTMLInputElement>('input[name="card-overview-height-number"]')!;
      height.value = '10';
      height.dispatchEvent(new Event('change'));

      expect(card.overViewWidth).toBe(800);
      expect(card.overViewMaxHeight).toBe(250);
    } finally {
      card.destroy();
    }
  });

  it('writes face text still waiting when the form is taken away', () => {
    vi.useFakeTimers();
    const card = Card.create('Leaving', 'front.png', 'back.png');
    fixture.componentRef.setInput('card', card);
    const textarea = document.createElement('textarea');
    textarea.value = 'Left behind';

    try {
      component.setCardOwnFaceText(card, { target: textarea } as unknown as Event);
      fixture.destroy();

      expect(card.faceText).toBe('Left behind');
    } finally {
      vi.useRealTimers();
      card.destroy();
    }
  });

  it('debounces card face text while typing and flushes it on request', () => {
    vi.useFakeTimers();
    const card = Card.create('Information', 'front.png', 'back.png');
    fixture.componentRef.setInput('card', card);
    const textarea = document.createElement('textarea');
    textarea.value = 'First draft';

    try {
      component.setCardOwnFaceText(card, { target: textarea } as unknown as Event);
      expect(card.faceText).toBe('');

      vi.advanceTimersByTime(65);
      expect(card.faceText).toBe('');
      vi.advanceTimersByTime(1);
      expect(card.faceText).toBe('First draft');

      textarea.value = 'Final draft';
      component.setCardOwnFaceText(card, { target: textarea } as unknown as Event);
      component.flushCardOwnFaceText();
      expect(card.faceText).toBe('Final draft');
    } finally {
      vi.useRealTimers();
      card.destroy();
    }
  });

  it('takes a new font size as it is typed rather than waiting for the field to be left', () => {
    const card = Card.create('Sized card', 'front.png', 'back.png');
    fixture.componentRef.setInput('card', card);

    try {
      fixture.detectChanges();
      const field = fixture.nativeElement.querySelector('input[type="number"][max="120"]') as HTMLInputElement;
      expect(field.value).toBe(`${Card.DEFAULT_FACE_FONT_SIZE}`);

      field.value = '1';
      field.dispatchEvent(new Event('input'));
      expect(card.faceFontSize).toBe(1);
    } finally {
      card.destroy();
    }
  });

  it('lets a colour be picked for the face text and keeps it from a hidden card', () => {
    const card = Card.create('Coloured card', 'front.png', 'back.png');
    fixture.componentRef.setInput('card', card);
    const picker = document.createElement('input');
    picker.type = 'color';
    picker.value = '#ff8800';

    try {
      component.setCardOwnFaceFontColor(card, { target: picker } as unknown as Event);
      expect(card.faceFontColor).toBe('#ff8800');
      expect(component.cardOwnFaceFontColor(card)).toBe('#ff8800');

      card.state = CardState.BACK;
      card.owner = 'another-user';
      expect(component.cardOwnFaceFontColor(card)).toBe(Card.DEFAULT_FACE_FONT_COLOR);

      picker.value = '#00ff00';
      component.setCardOwnFaceFontColor(card, { target: picker } as unknown as Event);
      expect(card.faceFontColor).toBe('#ff8800');
    } finally {
      card.destroy();
    }
  });

  it('does not put a hidden card face text into the editing DOM', () => {
    const card = Card.create('Hidden card', 'front.png', 'back.png');
    card.faceText = 'secret text';
    card.state = CardState.BACK;
    card.owner = 'another-user';
    fixture.componentRef.setInput('card', card);

    try {
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[data-card-face-locked]')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('textarea')).toBeNull();
      expect(fixture.nativeElement.textContent).not.toContain('secret text');
      expect(component.cardOwnFaceText(card)).toBe('');
    } finally {
      card.destroy();
    }
  });

  it('ignores text updates while the card face is hidden', () => {
    const card = Card.create('Hidden card', 'front.png', 'back.png');
    card.faceText = 'original secret';
    card.state = CardState.BACK;
    card.owner = 'another-user';
    const textarea = document.createElement('textarea');
    textarea.value = 'attempted overwrite';

    try {
      component.setCardOwnFaceText(card, { target: textarea } as unknown as Event);
      expect(card.faceText).toBe('original secret');
    } finally {
      card.destroy();
    }
  });

  it('keeps another users claimed face out of the editor even if its state is front', () => {
    const card = Card.create('Claimed card', 'front.png', 'back.png');
    card.faceText = 'claimed secret';
    card.owner = 'another-user';

    try {
      expect(component.canReadCardFace(card)).toBe(false);
      expect(component.cardOwnFaceText(card)).toBe('');
    } finally {
      card.destroy();
    }
  });
});
