import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModalService } from '@axe/application/ui/modal.service';
import { TextViewComponent } from '@axe/ui/components/text-view/text-view.component';

describe('TextViewComponent', () => {
  let component: TextViewComponent;
  let fixture: ComponentFixture<TextViewComponent>;

  function mount(option: unknown): void {
    TestBed.configureTestingModule({
      imports: [TextViewComponent],
      providers: [{ provide: ModalService, useValue: { option } }],
    }).compileComponents();
    fixture = TestBed.createComponent(TextViewComponent);
    component = fixture.componentInstance;
  }

  it('should be created', () => {
    mount(undefined);
    expect(component).toBeTruthy();
  });

  it('shows the title and the text it was opened with', () => {
    mount({ title: 'Heading', text: 'Body' });
    fixture.detectChanges();
    expect(component.modalTitle).toBe('Heading');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Body');
  });

  it('shows the text even when it was opened without a title', () => {
    mount({ text: 'Body' });
    fixture.detectChanges();
    expect(component.modalTitle).toBe('');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Body');
  });
});
