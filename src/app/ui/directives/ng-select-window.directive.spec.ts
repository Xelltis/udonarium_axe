import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { NgSelectWindowDirective } from '@axe/ui/directives/ng-select-window.directive';
import { NgSelectComponent } from '@ng-select/ng-select';

@Component({
  selector: 'select-host',
  template: '<ng-select [items]="items" [(ngModel)]="value" />',
  imports: [FormsModule, NgSelectComponent, NgSelectWindowDirective],
})
class SelectHostComponent {
  items = ['one', 'two', 'three'];
  value = 'one';
}

describe('NgSelectWindowDirective', () => {
  let paper: Document;

  function render() {
    const fixture = TestBed.createComponent(SelectHostComponent);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const select = fixture.debugElement.query(By.directive(NgSelectComponent)).componentInstance as NgSelectComponent;
    return { fixture, select };
  }

  beforeEach(() => {
    paper = document.implementation.createHTMLDocument('window');
  });

  afterEach(() => {
    for (const panel of document.querySelectorAll('.ng-dropdown-panel')) panel.remove();
  });

  it('opens the list in the window the select was put into', async () => {
    const { fixture, select } = render();
    paper.body.appendChild(fixture.nativeElement);

    select.open();
    fixture.detectChanges();
    await fixture.whenStable();

    const panel = paper.querySelector('.ng-dropdown-panel');
    expect(panel?.closest('ng-select')).toBeNull();
    expect(paper.body.contains(panel)).toBe(true);
    expect(document.querySelector('.ng-dropdown-panel')).toBeNull();
    fixture.destroy();
  });

  it('opens the list on the body of the main window while the select stands there, outside any panel', async () => {
    const { fixture, select } = render();

    select.open();
    fixture.detectChanges();
    await fixture.whenStable();

    const panel = document.querySelector('.ng-dropdown-panel');
    expect(panel?.closest('ng-select')).toBeNull();
    expect(document.body.contains(panel)).toBe(true);
    fixture.destroy();
  });

  it('follows a select carried to another window after it was opened once', async () => {
    const { fixture, select } = render();
    select.open();
    fixture.detectChanges();
    await fixture.whenStable();
    select.close();
    fixture.detectChanges();
    await fixture.whenStable();

    paper.body.appendChild(fixture.nativeElement);
    select.open();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(paper.querySelector('.ng-dropdown-panel')).not.toBeNull();
    fixture.destroy();
  });
});
