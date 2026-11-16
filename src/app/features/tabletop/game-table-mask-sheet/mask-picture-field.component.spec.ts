import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MaskPictureFieldComponent } from '@axe/features/tabletop/game-table-mask-sheet/mask-picture-field.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('MaskPictureFieldComponent', () => {
  let fixture: ComponentFixture<MaskPictureFieldComponent>;
  let raised: string[];

  const root = () => fixture.nativeElement as HTMLElement;
  const button = (action: string) => root().querySelector<HTMLButtonElement>(`[data-action="${action}"]`);

  function show(picture: { isSet: boolean; url: string }): void {
    fixture.componentRef.setInput('picture', picture);
    fixture.detectChanges();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [MaskPictureFieldComponent], providers: [...TEST_PROVIDERS] });
    fixture = TestBed.createComponent(MaskPictureFieldComponent);
    fixture.componentRef.setInput('setAction', 'set-picture');
    fixture.componentRef.setInput('clearAction', 'clear-picture');
    fixture.componentRef.setInput('alt', 'マスクの画像');
    raised = [];
    fixture.componentInstance.pick.subscribe(() => raised.push('pick'));
    fixture.componentInstance.clear.subscribe(() => raised.push('clear'));
  });

  it('shows a placeholder and only the set button while no picture is set', () => {
    show({ isSet: false, url: '' });

    expect(root().querySelector('img')).toBeNull();
    expect(button('set-picture')).not.toBeNull();
    expect(button('clear-picture')).toBeNull();

    button('set-picture')!.click();
    expect(raised).toEqual(['pick']);
  });

  it('shows the picture and offers to take it off once one is set', () => {
    show({ isSet: true, url: 'blob:picture' });

    const img = root().querySelector('img')!;
    expect(img.getAttribute('src')).toBe('blob:picture');
    expect(img.alt).toBe('マスクの画像');

    button('clear-picture')!.click();
    expect(raised).toEqual(['clear']);
  });

  it('offers to take off a picture that is set though its file has not arrived', () => {
    show({ isSet: true, url: '' });

    expect(root().querySelector('img')).toBeNull();
    expect(button('clear-picture')).not.toBeNull();
  });
});
