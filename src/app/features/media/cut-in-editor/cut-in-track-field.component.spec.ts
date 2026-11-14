import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CutInTrackFieldComponent } from '@axe/features/media/cut-in-editor/cut-in-track-field.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('CutInTrackFieldComponent', () => {
  let fixture: ComponentFixture<CutInTrackFieldComponent>;
  let host: HTMLElement;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [CutInTrackFieldComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
    fixture = TestBed.createComponent(CutInTrackFieldComponent);
    fixture.componentRef.setInput('label', '不透明度');
    fixture.componentRef.setInput('name', 'cut-in-layer-opacity');
    fixture.componentRef.setInput('value', 40);
    fixture.componentRef.setInput('editable', true);
    host = fixture.nativeElement as HTMLElement;
  });

  async function drawn(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  function field(): HTMLInputElement {
    return host.querySelector<HTMLInputElement>('input')!;
  }

  function diamond(): HTMLButtonElement {
    return host.querySelector<HTMLButtonElement>('button')!;
  }

  it('lays its label, field and diamond straight into the grid it stands in', async () => {
    await drawn();

    expect(host.classList.contains('contents')).toBe(true);
    expect([...host.children].map((child) => child.tagName)).toEqual(['LABEL', 'INPUT', 'BUTTON']);
    expect(host.querySelector('label')!.textContent).toBe('不透明度');
  });

  it('shows the value in a number field under the name given, with the bounds given', async () => {
    fixture.componentRef.setInput('min', 0);
    fixture.componentRef.setInput('max', 100);
    await drawn();

    expect(field().type).toBe('number');
    expect(field().getAttribute('name')).toBe('cut-in-layer-opacity');
    expect(field().value).toBe('40');
    expect([field().getAttribute('min'), field().getAttribute('max')]).toEqual(['0', '100']);
  });

  it('leaves the bounds off a field given none', async () => {
    await drawn();

    expect(field().hasAttribute('min')).toBe(false);
    expect(field().hasAttribute('max')).toBe(false);
  });

  it('draws a bar to slide along when asked for one', async () => {
    fixture.componentRef.setInput('slider', true);
    await drawn();

    expect(field().type).toBe('range');
  });

  it('writes what is typed as a number', async () => {
    const written: number[] = [];
    fixture.componentInstance.value.subscribe((value) => written.push(value));
    await drawn();

    field().value = '75';
    field().dispatchEvent(new Event('input'));

    expect(written).toEqual([75]);
  });

  it('takes a value changed from outside into the field', async () => {
    await drawn();

    fixture.componentRef.setInput('value', 12);
    await drawn();

    expect(field().value).toBe('12');
  });

  it('lights the diamond only where a key stands, and asks for the key to be toggled when pressed', async () => {
    let asked = 0;
    fixture.componentInstance.keyToggled.subscribe(() => asked++);
    await drawn();
    expect(diamond().classList.contains('text-ui-accent!')).toBe(false);

    fixture.componentRef.setInput('keyed', true);
    await drawn();
    expect(diamond().classList.contains('text-ui-accent!')).toBe(true);

    diamond().click();
    expect(asked).toBe(1);
  });

  it('takes neither typing nor a press once it is not editable', async () => {
    await drawn();
    fixture.componentRef.setInput('editable', false);
    await drawn();

    expect(field().hasAttribute('disabled')).toBe(true);
    expect(diamond().disabled).toBe(true);
  });

  it('is drawn taking no typing when it is not editable from the first', async () => {
    fixture.componentRef.setInput('editable', false);
    await drawn();
    expect(field().disabled).toBe(true);

    fixture.componentRef.setInput('slider', true);
    await drawn();
    expect(field().disabled).toBe(true);

    fixture.componentRef.setInput('editable', true);
    await drawn();
    expect(field().disabled).toBe(false);
  });
});
