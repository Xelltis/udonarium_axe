import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BadgeComponent } from '@axe/ui/components/badge/badge.component';

describe('BadgeComponent', () => {
  let component: BadgeComponent;
  let fixture: ComponentFixture<BadgeComponent>;

  function badge(): HTMLElement {
    return fixture.nativeElement.querySelector('div');
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [BadgeComponent],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(BadgeComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('counts nothing by default', () => {
    expect(component.count()).toBe(0);
  });

  it('takes its count from an input signal', () => {
    fixture.componentRef.setInput('count', 5);
    expect(component.count()).toBe(5);
  });

  it('bounces as it appears and rests once the bounce has finished', () => {
    fixture.detectChanges();
    expect(badge().classList.contains('bouncing')).toBe(true);
    badge().dispatchEvent(new Event('animationend'));
    fixture.detectChanges();
    expect(badge().classList.contains('bouncing')).toBe(false);
  });

  it('bounces again on a new element for every change of its count', () => {
    fixture.detectChanges();
    const first = badge();
    first.dispatchEvent(new Event('animationend'));
    fixture.detectChanges();

    fixture.componentRef.setInput('count', 3);
    fixture.detectChanges();
    expect(badge()).not.toBe(first);
    expect(badge().classList.contains('bouncing')).toBe(true);
    expect(badge().textContent?.trim()).toBe('3');

    const second = badge();
    fixture.componentRef.setInput('count', 4);
    fixture.detectChanges();
    expect(badge()).not.toBe(second);
    expect(badge().classList.contains('bouncing')).toBe(true);
  });
});
