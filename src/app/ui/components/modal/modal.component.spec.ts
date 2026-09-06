import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModalComponent } from '@axe/ui/components/modal/modal.component';

describe('ModalComponent', () => {
  let component: ModalComponent;
  let fixture: ComponentFixture<ModalComponent>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [ModalComponent],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ModalComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('title getter', () => {
    it('reads its title from the modal service', () => {
      component.modalService.title = 'テストタイトル';
      expect(component.title).toBe('テストタイトル');
    });
  });

  describe('the fitWidth option', () => {
    it('uses a fixed width by default', () => {
      fixture.detectChanges();
      const panel = fixture.nativeElement.querySelector('.animate-fly-in') as HTMLElement;
      expect(panel.classList.contains('w-200')).toBe(true);
      expect(panel.classList.contains('w-fit')).toBe(false);
    });

    it('lets the child decide the width when fitWidth is set', () => {
      vi.spyOn(component.modalService, 'option', 'get').mockReturnValue({ fitWidth: true });
      fixture.detectChanges();
      const panel = fixture.nativeElement.querySelector('.animate-fly-in') as HTMLElement;
      expect(panel.classList.contains('w-fit')).toBe(true);
      expect(panel.classList.contains('w-200')).toBe(false);
    });
  });

  it('rotates a modal toward the direction inherited from its menu action', () => {
    component.modalService.rotationDegrees.set(270);
    fixture.detectChanges();

    const panel = fixture.nativeElement.querySelector('.animate-fly-in') as HTMLElement;
    expect(panel.style.rotate).toBe('270deg');
    expect(panel.dataset['modalRotation']).toBe('270');
    expect(panel.style.maxWidth).toBe('calc(100dvh - 10px)');
    expect(panel.style.maxHeight).toBe('calc(100vw - 10px)');
  });
});
