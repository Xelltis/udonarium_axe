import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OperatorContactComponent } from '@axe/features/lobby/operator-contact/operator-contact.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('OperatorContactComponent', () => {
  let fixture: ComponentFixture<OperatorContactComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [OperatorContactComponent], providers: [...TEST_PROVIDERS] });
    fixture = TestBed.createComponent(OperatorContactComponent);
  });

  const link = () => fixture.nativeElement.querySelector('[data-testid="operator-contact-link"]') as HTMLAnchorElement;

  it('links a page, to open apart from the app', () => {
    fixture.componentRef.setInput('contact', 'https://example.com/contact');
    fixture.detectChanges();

    expect(link().href).toBe('https://example.com/contact');
    expect(link().target).toBe('_blank');
    expect(link().rel).toBe('noopener noreferrer');
    expect(link().textContent).toBe('https://example.com/contact');
    expect(fixture.nativeElement.textContent).toContain('問い合わせ先');
  });

  it('writes a mail address without its scheme, linking it as one', () => {
    fixture.componentRef.setInput('contact', 'mailto:admin@example.com');
    fixture.detectChanges();

    expect(link().href).toBe('mailto:admin@example.com');
    expect(link().textContent).toBe('admin@example.com');
  });
});
