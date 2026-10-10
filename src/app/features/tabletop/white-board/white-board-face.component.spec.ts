import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { WhiteBoard } from '@axe/domain/tabletop/white-board';
import { WhiteBoardFaceComponent } from '@axe/features/tabletop/white-board/white-board-face.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('WhiteBoardFaceComponent', () => {
  let fixture: ComponentFixture<WhiteBoardFaceComponent>;
  let board: WhiteBoard;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WhiteBoardFaceComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
    board = WhiteBoard.create('ボード', 4, 3, 1);
    fixture = TestBed.createComponent(WhiteBoardFaceComponent);
    fixture.componentRef.setInput('whiteBoard', board);
  });

  afterEach(() => board.destroy());

  /** Gives the host the size a ResizeObserver would report for it. */
  function sizeHost(width: number, height: number): void {
    (fixture.componentInstance as unknown as { hostSize: { set(size: object): void } }).hostSize.set({
      width,
      height,
    });
    fixture.detectChanges();
  }

  const face = () => fixture.nativeElement.querySelector('[data-testid="white-board-face"]') as HTMLElement | null;

  it('draws nothing until the host has a size', () => {
    fixture.detectChanges();
    expect(face()).toBeNull();
  });

  it('stands the board in the middle of the host, as large as it holds it in the board’s proportions', () => {
    fixture.componentRef.setInput('padding', 10);
    sizeHost(500, 300);

    const style = face()!.style;
    expect(parseFloat(style.width)).toBeCloseTo(373.33, 1);
    expect(parseFloat(style.height)).toBeCloseTo(280, 1);
    expect(parseFloat(style.left)).toBeCloseTo(63.33, 1);
    expect(parseFloat(style.top)).toBeCloseTo(10, 1);
  });

  it('shows the board’s colour and what is drawn on it', () => {
    const picture = ImageStorage.instance.add('board-drawn.png');
    board.color = '#123456';
    board.imageDataElement!.getFirstElementByName('imageIdentifier')!.value = picture.identifier;
    sizeHost(400, 300);

    try {
      const html = face()?.innerHTML ?? '';
      expect(html).toContain('#123456');
      expect(html).toContain(picture.url);
    } finally {
      ImageStorage.instance.delete(picture.identifier);
    }
  });
});
