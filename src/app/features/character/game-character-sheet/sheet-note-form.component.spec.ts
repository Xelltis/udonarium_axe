import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { ImageFile } from '@axe/core/storage/image-file';
import { TextNote } from '@axe/domain/tabletop/text-note';
import { SheetNoteFormComponent } from '@axe/features/character/game-character-sheet/sheet-note-form.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('SheetNoteFormComponent', () => {
  let fixture: ComponentFixture<SheetNoteFormComponent>;
  let note: TextNote;

  function root(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function write(field: HTMLInputElement | HTMLTextAreaElement, value: string, type = 'change'): void {
    field.value = value;
    field.dispatchEvent(new Event(type));
  }

  const numbers = () => [...root().querySelectorAll<HTMLInputElement>('.grid input[type="number"]')];

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [SheetNoteFormComponent], providers: [...TEST_PROVIDERS] });
    fixture = TestBed.createComponent(SheetNoteFormComponent);
    note = TextNote.create('メモ', '# 洞窟');
    fixture.componentRef.setInput('note', note);
    fixture.componentRef.setInput('imageFile', ImageFile.Empty);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => note.destroy());

  it('writes the title and the body to the note', () => {
    write(root().querySelector<HTMLInputElement>('input[type="text"]')!, '地図');
    write(root().querySelector<HTMLTextAreaElement>('textarea')!, '森の奥', 'input');

    expect(note.title).toBe('地図');
    expect(note.text).toBe('森の奥');
  });

  it('switches the body between as typed and formatted, with the formatted body shown under it', () => {
    expect(root().querySelector('[data-testid="text-note-format-preview"]')).toBeNull();

    root().querySelector<HTMLButtonElement>('[data-testid="text-note-format-formatted"]')!.click();
    fixture.detectChanges();

    expect(note.isFormatted).toBe(true);
    expect(note.text).toBe('# 洞窟');
    expect(root().querySelector('[data-testid="text-note-format-preview"] h1')?.textContent).toBe('洞窟');

    root().querySelector<HTMLButtonElement>('[data-testid="text-note-format-plain"]')!.click();
    fixture.detectChanges();
    expect(note.isFormatted).toBe(false);
    expect(root().querySelector('[data-testid="text-note-format-preview"]')).toBeNull();
  });

  it('holds the size of the note, its font and its altitude within what the fields allow', () => {
    const [width, height, fontSize, altitude] = numbers();

    write(width, '99');
    write(height, '0');
    write(fontSize, '12.6');
    write(altitude, '-50');

    expect(note.width).toBe(24);
    expect(note.height).toBe(1);
    expect(note.fontSize).toBe(13);
    expect(note.altitude).toBe(-20);
  });

  it('leaves the note as it was for a field emptied', () => {
    const [width, , , altitude] = numbers();
    const before = { width: note.width, altitude: note.altitude };

    write(width, '');
    write(altitude, '');

    expect({ width: note.width, altitude: note.altitude }).toEqual(before);
  });

  it('asks the note to fit its height again once the limit on it is switched', async () => {
    const resize = vi.spyOn(TestBed.inject(UiSignalService), 'requestNoteResize');

    root().querySelector<HTMLInputElement>('input[name="text-note-limit-height"]')!.click();
    expect(resize).not.toHaveBeenCalled();

    fixture.detectChanges();
    await fixture.whenStable();
    expect(resize).toHaveBeenCalledWith(note.identifier);
    resize.mockRestore();
  });

  it('holds the popup the note opens to the sizes a popup may have', () => {
    write(root().querySelector<HTMLInputElement>('input[name="note-overview-width-number"]')!, '5000');
    write(root().querySelector<HTMLInputElement>('input[name="note-overview-height-number"]')!, '10');

    expect(note.overViewWidth).toBe(800);
    expect(note.overViewMaxHeight).toBe(250);
  });

  it('shows the picture of the note at its foot only where it has one', () => {
    expect(root().querySelector('img')).toBeNull();

    fixture.componentRef.setInput('imageFile', { url: 'blob:note', name: 'note.png' } as ImageFile);
    fixture.detectChanges();

    expect(root().querySelector('img')?.getAttribute('alt')).toBe('note.png');
  });

  it('passes its picture, copy and save buttons on to the sheet', () => {
    const pressed: string[] = [];
    fixture.componentInstance.imagePick.subscribe(() => pressed.push('image'));
    fixture.componentInstance.copyPressed.subscribe(() => pressed.push('copy'));
    fixture.componentInstance.savePressed.subscribe(() => pressed.push('save'));

    for (const button of [...root().querySelectorAll<HTMLButtonElement>('section:first-of-type button')])
      button.click();

    expect(pressed).toEqual(['image', 'copy', 'save']);
  });
});
