import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiImagePickerTileComponent } from '@axe/ui/components/image-picker-tile/image-picker-tile.component';

describe('UiImagePickerTileComponent', () => {
  let fixture: ComponentFixture<UiImagePickerTileComponent>;
  let picked: number;

  const root = () => fixture.nativeElement as HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [UiImagePickerTileComponent] });
    fixture = TestBed.createComponent(UiImagePickerTileComponent);
    fixture.componentRef.setInput('url', '');
    fixture.componentRef.setInput('addLabel', '画像を追加');
    picked = 0;
    fixture.componentInstance.pick.subscribe(() => picked++);
  });

  it('asks for a picture with a dashed button while there is none, found by the test id it was given', () => {
    fixture.componentRef.setInput('addTestId', 'floor-pick');
    fixture.detectChanges();

    const button = root().querySelector('button')!;
    expect(root().querySelector('img')).toBeNull();
    expect(button.textContent?.trim()).toBe('画像を追加');
    expect(button.dataset['testid']).toBe('floor-pick');
    expect(button.type).toBe('button');

    button.click();
    expect(picked).toBe(1);
  });

  it('carries no test id on the button unless it is given one', () => {
    fixture.detectChanges();

    expect(root().querySelector('button')!.hasAttribute('data-testid')).toBe(false);
  });

  it('shows the picture as a thumbnail once there is one, and picks again from it', () => {
    fixture.componentRef.setInput('url', 'blob:picture');
    fixture.componentRef.setInput('alt', '床の画像');
    fixture.detectChanges();

    const img = root().querySelector('img')!;
    expect(root().querySelector('button')).toBeNull();
    expect(img.getAttribute('src')).toBe('blob:picture');
    expect(img.alt).toBe('床の画像');

    img.click();
    expect(picked).toBe(1);
  });

  it('stands in the layout of whatever holds it, as the thumbnail itself would', () => {
    fixture.detectChanges();

    expect(root().classList.contains('contents')).toBe(true);
  });
});
