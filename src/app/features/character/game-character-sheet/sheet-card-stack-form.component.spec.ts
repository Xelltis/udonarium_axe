import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ImageFile } from '@axe/core/storage/image-file';
import { CardStack } from '@axe/domain/card/card-stack';
import { SheetCardStackFormComponent } from '@axe/features/character/game-character-sheet/sheet-card-stack-form.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('SheetCardStackFormComponent', () => {
  let fixture: ComponentFixture<SheetCardStackFormComponent>;
  let stack: CardStack;

  function root(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function change(field: HTMLInputElement, value: string): void {
    field.value = value;
    field.dispatchEvent(new Event('change'));
  }

  const tabs = () =>
    [...root().querySelectorAll<HTMLButtonElement>('button')].filter(
      (button) => !button.closest('sheet-save-buttons, card-stack-card-list')
    );

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [SheetCardStackFormComponent], providers: [...TEST_PROVIDERS] });
    fixture = TestBed.createComponent(SheetCardStackFormComponent);
    stack = CardStack.create('山札');
    fixture.componentRef.setInput('cardStack', stack);
    fixture.componentRef.setInput('imageFile', ImageFile.Empty);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => stack.destroy());

  it('shows the cards first, and the settings once their tab is pressed, saying so to the sheet', () => {
    expect(root().querySelector('card-stack-card-list')).not.toBeNull();
    expect(root().querySelector('input[type="text"]')).toBeNull();

    tabs()[1].click();
    fixture.detectChanges();

    expect(fixture.componentInstance.activeTab()).toBe('settings');
    expect(root().querySelector('card-stack-card-list')).toBeNull();
    expect(root().querySelector('input[type="text"]')).not.toBeNull();

    tabs()[0].click();
    fixture.detectChanges();
    expect(fixture.componentInstance.activeTab()).toBe('sheet');
    expect(root().querySelector('card-stack-card-list')).not.toBeNull();
  });

  it('renames the deck, and shows the name again as it changes in the room', async () => {
    fixture.componentRef.setInput('activeTab', 'settings');
    fixture.detectChanges();
    const name = () => root().querySelector<HTMLInputElement>('input[type="text"]')!;
    expect(name().value).toBe('山札');

    change(name(), '捨て札');
    expect(stack.name).toBe('捨て札');

    stack.name = '手札';
    await fixture.whenStable();
    fixture.detectChanges();
    expect(name().value).toBe('手札');
  });

  it('holds the popup the deck opens to the sizes a popup may have', () => {
    fixture.componentRef.setInput('activeTab', 'settings');
    fixture.detectChanges();

    change(root().querySelector<HTMLInputElement>('input[name="cs-overview-width-number"]')!, '5000');
    change(root().querySelector<HTMLInputElement>('input[name="cs-overview-height-number"]')!, '10');

    expect(stack.overViewWidth).toBe(800);
    expect(stack.overViewMaxHeight).toBe(250);
  });

  it('shows the picture of the deck beside its name only where it has one', () => {
    fixture.componentRef.setInput('activeTab', 'settings');
    fixture.detectChanges();
    expect(root().querySelector('img')).toBeNull();

    fixture.componentRef.setInput('imageFile', { url: 'blob:deck', name: 'deck.png' } as ImageFile);
    fixture.detectChanges();

    expect(root().querySelector('img')?.getAttribute('alt')).toBe('deck.png');
  });

  it('passes its copy and save buttons on to the sheet, the save button busy while the sheet saves', () => {
    const pressed: string[] = [];
    fixture.componentInstance.copyPressed.subscribe(() => pressed.push('copy'));
    fixture.componentInstance.savePressed.subscribe(() => pressed.push('save'));
    const [copy, save] = [...root().querySelectorAll<HTMLButtonElement>('sheet-save-buttons button')];

    copy.click();
    save.click();
    expect(pressed).toEqual(['copy', 'save']);

    fixture.componentRef.setInput('saving', true);
    fixture.detectChanges();
    expect(save.disabled).toBe(true);
  });
});
